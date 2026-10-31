// The TV output on the phone: a true second screen, not a mirror.
//
// When an external display connects (AirPlay screen mirroring to an Apple TV or
// AirPlay TV, or a USB-C / HDMI adapter) iOS offers the app a scene with the role
// UIWindowSceneSessionRoleExternalDisplayNonInteractive. The engine's app delegate
// (GDTApplicationDelegate) would take that scene as its own and treat its
// lifecycle as the game's (a TV unplugged would stop the engine's rendering and
// audio), so its scene configuration is redirected here for that role only:
// PTTVSceneDelegate owns the TV scene and puts one window on it whose view is a
// CAMetalLayer.
//
// The game renders its world and HUD into a SubViewport sized for the TV
// (native/screens.gd), once per TV refresh (pt_tv_take_ticks). Its colour texture
// (an MTLTexture, from RenderingServer.texture_get_native_handle) and the engine's
// own MTLCommandQueue (RenderingDevice.get_driver_resource) are handed over with
// pt_tv_set_source; each frame the engine draws is copied into one of three slots
// and presented on the TV from a thread of its own (see PTTV below). Everything
// stays on the GPU.
//
// The phone keeps the engine's own view; screens.gd draws the phone UI there.

#import "tv_native.h"

#import <AVFoundation/AVFoundation.h>
#import <AVKit/AVKit.h>
#import <Metal/Metal.h>
#import <QuartzCore/QuartzCore.h>
#import <UIKit/UIKit.h>
#import <objc/message.h>
#import <os/lock.h>
#import <objc/runtime.h>

static BOOL pt_is_tv_role(NSString *role) {
	if (role == nil) return NO;
	if (@available(iOS 16.0, *)) {
		if ([role isEqualToString:UIWindowSceneSessionRoleExternalDisplayNonInteractive]) return YES;
	}
	// (the iOS 13-15 name of the same role)
	return [role isEqualToString:@"UIWindowSceneSessionRoleExternalDisplay"] || [role containsString:@"ExternalDisplay"];
}

// ---------------------------------------------------------------------------
@interface PTTVView : UIView
@end
@implementation PTTVView
+ (Class)layerClass {
	return [CAMetalLayer class];
}
@end

@interface PTTVController : UIViewController
@end
@implementation PTTVController
- (void)loadView {
	PTTVView *v = [[PTTVView alloc] initWithFrame:CGRectZero];
	v.backgroundColor = UIColor.blackColor;
	v.opaque = YES;
	v.userInteractionEnabled = NO;
	self.view = v;
}
- (BOOL)prefersStatusBarHidden {
	return YES;
}
- (BOOL)prefersHomeIndicatorAutoHidden {
	return YES;
}
@end

// ---------------------------------------------------------------------------
// Frames reach the TV through three slots (textures of the game's frame size):
//   main thread, as soon as the engine has drawn a frame (pt_tv_frame_drawn): the
//   frame is copied into a free slot on the ENGINE's command queue (so it is the
//   exact frame, ordered after the engine's writes, before its next frame's) and a
//   shared event is signalled with the slot's number; the slot is "ready".
//   presenter thread, at each TV refresh (a display link on the TV's screen, on
//   its own thread): the oldest ready slot is drawn into the TV's drawable on the
//   plugin's own queue, after waiting (on the GPU) for that slot's event, and
//   presented; the slot is free again once that command buffer completes.
// The main thread never waits for a drawable (AirPlay's capture can hold them for
// a whole refresh, which used to lock the game to every other TV refresh); every
// frame is shown once, in order; a frame is only dropped when three are waiting.
enum { SLOT_FREE = 0, SLOT_WRITING, SLOT_READY, SLOT_SHOWING };
#define PT_SLOTS 3

@interface PTTV : NSObject {
@public
	os_unfair_lock lk;
	id<MTLTexture> slot[PT_SLOTS];
	int state[PT_SLOTS];
	uint64_t value[PT_SLOTS];
	uint64_t seq[PT_SLOTS];
}
@property(nonatomic, strong) UIWindowScene *scene;
@property(nonatomic, strong) UIWindow *window;
@property(nonatomic, strong) CAMetalLayer *layer;
@property(nonatomic, strong) CADisplayLink *link;
@property(nonatomic, strong) NSThread *thread;
@property(nonatomic, strong) id<MTLTexture> source;
@property(nonatomic, strong) id<MTLTexture> sourceView;   // a 2D view when the source is an array
@property(nonatomic, strong) id<MTLCommandQueue> queue;   // the engine's
@property(nonatomic, strong) id<MTLCommandQueue> ownQueue;
@property(nonatomic, strong) id<MTLDevice> device;
@property(nonatomic, strong) id<MTLSharedEvent> event;
@property(nonatomic, strong) NSMutableDictionary<NSNumber *, id<MTLRenderPipelineState>> *pipelines;
@property(nonatomic, strong) id<MTLSamplerState> sampler;
@property(nonatomic, strong) AVRoutePickerView *picker;
@property(atomic) BOOL active;
@property(atomic) BOOL cleared;
@property(atomic) int frames;
@property(atomic) int generation;
@property(atomic) int wantHeight;          // the TV mode's height asked for (0 = the screen's own)
@property(atomic) MTLPixelFormat slotFormat;
// pacing and its numbers (under lk)
@property(nonatomic) uint64_t eventValue, seqNext;
@property(nonatomic) int ticks;
@property(nonatomic) BOOL fresh;
@property(nonatomic) CFTimeInterval lastStamp, lastShown, statAt;
@property(nonatomic) double period, pMin, pMax, gapMax, blitAcc;
@property(nonatomic) int nTicks, nPresented, nRepeated, nSkipped, nLate, nBlit;
@property(nonatomic) double rPresented, rRepeated, rSkipped, rLate, rLink, rLinkMin, rLinkMax, rGap, rBlit;
+ (instancetype)shared;
- (void)attachScene:(UIWindowScene *)scene;
- (void)detachScene:(UIScene *)scene;
@end

@interface PTTVSceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end

@implementation PTTVSceneDelegate
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
	if ([scene isKindOfClass:[UIWindowScene class]]) [[PTTV shared] attachScene:(UIWindowScene *)scene];
	self.window = [PTTV shared].window;
}
- (void)sceneDidDisconnect:(UIScene *)scene {
	[[PTTV shared] detachScene:scene];
	self.window = nil;
}
@end

// the engine's scene configuration, but the TV role goes to PTTVSceneDelegate
static IMP pt_orig_config = NULL;
static UISceneConfiguration *pt_config(id self, SEL cmd, UIApplication *app, UISceneSession *session, UISceneConnectionOptions *opts) {
	if (pt_is_tv_role(session.role)) {
		UISceneConfiguration *c = [[UISceneConfiguration alloc] initWithName:@"Pallet TV" sessionRole:session.role];
		c.delegateClass = [PTTVSceneDelegate class];
		return c;
	}
	if (pt_orig_config) return ((UISceneConfiguration * (*)(id, SEL, UIApplication *, UISceneSession *, UISceneConnectionOptions *)) pt_orig_config)(self, cmd, app, session, opts);
	UISceneConfiguration *c = [[UISceneConfiguration alloc] initWithName:@"Default Configuration" sessionRole:session.role];
	return c;
}

static void pt_install(void) {
	static BOOL done = NO;
	if (done) return;
	done = YES;
	Class c = NSClassFromString(@"GDTApplicationDelegate");
	SEL sel = @selector(application:configurationForConnectingSceneSession:options:);
	Method m = c ? class_getInstanceMethod(c, sel) : NULL;
	if (m) {
		pt_orig_config = method_setImplementation(m, (IMP)pt_config);
	} else if (c) {
		class_addMethod(c, sel, (IMP)pt_config, "@@:@@@");
	}
	// a TV scene that reached another delegate anyway (or connected before this ran):
	// take its screen all the same, and give the engine back its focus if the TV
	// scene's end took it (see pt_refocus)
	NSNotificationCenter *nc = NSNotificationCenter.defaultCenter;
	[nc addObserverForName:UISceneWillConnectNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *n) {
		UIScene *s = n.object;
		if ([s isKindOfClass:[UIWindowScene class]] && pt_is_tv_role(s.session.role) && ![s.delegate isKindOfClass:[PTTVSceneDelegate class]]) {
			[[PTTV shared] attachScene:(UIWindowScene *)s];
		}
	}];
	[nc addObserverForName:UISceneDidDisconnectNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *n) {
		UIScene *s = n.object;
		if (pt_is_tv_role(s.session.role)) [[PTTV shared] detachScene:s];
	}];
	dispatch_async(dispatch_get_main_queue(), ^{
		for (UIScene *s in UIApplication.sharedApplication.connectedScenes) {
			if ([s isKindOfClass:[UIWindowScene class]] && pt_is_tv_role(s.session.role)) [[PTTV shared] attachScene:(UIWindowScene *)s];
		}
	});
}

// the phone's scene, foreground and active
static UIWindowScene *pt_phone_scene(void) {
	UIWindowScene *best = nil;
	for (UIScene *s in UIApplication.sharedApplication.connectedScenes) {
		if (![s isKindOfClass:[UIWindowScene class]] || pt_is_tv_role(s.session.role)) continue;
		if (s.activationState == UISceneActivationStateForegroundActive) return (UIWindowScene *)s;
		if (best == nil) best = (UIWindowScene *)s;
	}
	return best;
}

// The engine stops rendering when any scene its delegate owns resigns or
// disconnects. If the TV scene was one of those, tell the engine's services the
// phone's scene is still active (the engine starts rendering again).
static void pt_refocus(UIScene *tv) {
	if (tv == nil || [tv.delegate isKindOfClass:[PTTVSceneDelegate class]]) return;
	UIWindowScene *phone = pt_phone_scene();
	if (phone == nil || phone.activationState != UISceneActivationStateForegroundActive) return;
	Class c = NSClassFromString(@"GDTApplicationDelegate");
	SEL ss = NSSelectorFromString(@"services");
	if (c == nil || ![c respondsToSelector:ss]) return;
	NSArray *services = ((NSArray * (*)(id, SEL)) objc_msgSend)(c, ss);
	for (id svc in services) {
		if ([svc respondsToSelector:@selector(sceneDidBecomeActive:)]) [svc sceneDidBecomeActive:phone];
	}
}

@implementation PTTV

+ (void)load {
	// as the app starts, before any scene connects
	pt_install();
}

+ (instancetype)shared {
	static PTTV *s = nil;
	static dispatch_once_t once;
	dispatch_once(&once, ^{
		s = [PTTV new];
		s->lk = OS_UNFAIR_LOCK_INIT;
		s.pipelines = [NSMutableDictionary new];
	});
	return s;
}

// the presenter's thread: a run loop for the TV's display link
- (void)threadMain {
	@autoreleasepool {
		[NSRunLoop.currentRunLoop addPort:[NSMachPort port] forMode:NSDefaultRunLoopMode];
		while (!NSThread.currentThread.isCancelled) {
			@autoreleasepool {
				[NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:1.0]];
			}
		}
	}
}

- (void)startLinkOn:(CADisplayLink *)link {
	[link addToRunLoop:NSRunLoop.currentRunLoop forMode:NSDefaultRunLoopMode];
}

- (void)stopLink:(CADisplayLink *)link {
	[link invalidate];
}

- (void)attachScene:(UIWindowScene *)scene {
	if (self.scene == scene && self.window != nil) return;
	if (self.scene != nil) [self teardown];
	self.scene = scene;
	UIScreen *screen = scene.screen;
	// the whole panel: the game keeps its HUD inside the TV's safe margin itself
	screen.overscanCompensation = UIScreenOverscanCompensationNone;
	UIWindow *w = [[UIWindow alloc] initWithWindowScene:scene];
	w.backgroundColor = UIColor.blackColor;
	PTTVController *vc = [PTTVController new];
	w.rootViewController = vc;
	w.hidden = NO;
	self.window = w;
	CAMetalLayer *layer = (CAMetalLayer *)vc.view.layer;
	layer.opaque = YES;
	layer.framebufferOnly = YES;
	layer.presentsWithTransaction = NO;
	layer.maximumDrawableCount = 3;
	layer.pixelFormat = MTLPixelFormatBGRA8Unorm;
	vc.view.contentScaleFactor = screen.scale;
	if (self.device) layer.device = self.device;
	os_unfair_lock_lock(&lk);
	self.layer = layer;
	self.ticks = 0;
	self.period = 0;
	self.lastStamp = 0;
	self.lastShown = 0;
	self.statAt = 0;
	for (int i = 0; i < PT_SLOTS; i++) if (state[i] != SLOT_SHOWING) state[i] = SLOT_FREE;
	os_unfair_lock_unlock(&lk);
	[self layout];
	self.cleared = NO;
	self.frames = 0;
	self.generation += 1;
	[self applyMode];
	if (self.thread == nil) {
		self.thread = [[NSThread alloc] initWithTarget:self selector:@selector(threadMain) object:nil];
		self.thread.name = @"Pallet TV presenter";
		self.thread.qualityOfService = NSQualityOfServiceUserInteractive;
		[self.thread start];
	}
	CADisplayLink *link = [screen displayLinkWithTarget:self selector:@selector(tick:)];
	if (@available(iOS 15.0, *)) {
		float hz = (float)MAX(30, screen.maximumFramesPerSecond);
		link.preferredFrameRateRange = CAFrameRateRangeMake(hz, hz, hz);
	}
	self.link = link;
	[self performSelector:@selector(startLinkOn:) onThread:self.thread withObject:link waitUntilDone:NO];
	NSLog(@"[tv] connected: %dx%d @%ld Hz", (int)screen.currentMode.size.width, (int)screen.currentMode.size.height, (long)screen.maximumFramesPerSecond);
}

- (void)layout {
	if (self.window == nil || self.scene == nil) return;
	UIScreen *screen = self.scene.screen;
	self.window.frame = screen.bounds;
	self.window.rootViewController.view.frame = screen.bounds;
	CGSize px = screen.currentMode ? screen.currentMode.size : CGSizeMake(screen.bounds.size.width * screen.scale, screen.bounds.size.height * screen.scale);
	// (an external mode is always wider than tall; a 0 size waits for the mode)
	if (px.width > 0 && px.height > 0) self.layer.drawableSize = px;
}

// the TV's mode: the tallest one no taller than wantHeight (0 = the TV's preferred)
- (void)applyMode {
	UIScreen *screen = self.scene.screen;
	if (screen == nil) return;
	UIScreenMode *best = nil;
	if (self.wantHeight > 0) {
		for (UIScreenMode *m in screen.availableModes) {
			if (m.size.height > self.wantHeight + 1) continue;
			if (best == nil || m.size.height > best.size.height) best = m;
		}
	}
	if (best == nil) best = screen.preferredMode;
	if (best != nil && ![best isEqual:screen.currentMode]) {
		screen.currentMode = best;
		NSLog(@"[tv] mode %dx%d", (int)best.size.width, (int)best.size.height);
	}
	[self layout];
}

- (void)teardown {
	if (self.link && self.thread) [self performSelector:@selector(stopLink:) onThread:self.thread withObject:self.link waitUntilDone:YES];
	self.link = nil;
	os_unfair_lock_lock(&lk);
	self.layer = nil;
	os_unfair_lock_unlock(&lk);
	self.window.hidden = YES;
	self.window.rootViewController = nil;
	self.window = nil;
	self.scene = nil;
}

- (void)detachScene:(UIScene *)scene {
	if (scene != self.scene) return;
	UIScene *was = self.scene;
	[self teardown];
	self.generation += 1;
	NSLog(@"[tv] disconnected");
	dispatch_async(dispatch_get_main_queue(), ^{
		pt_refocus(was);
	});
}

// ---------- drawing ----------
static NSString *const kShader =
		@"#include <metal_stdlib>\n"
		 "using namespace metal;\n"
		 "struct V { float4 p [[position]]; float2 uv; };\n"
		 "vertex V pt_vs(uint vid [[vertex_id]], constant float4 &r [[buffer(0)]]) {\n"
		 "  float2 q = float2((vid << 1) & 2, vid & 2);\n"
		 "  V o; o.p = float4(q * 2.0 - 1.0, 0.0, 1.0);\n"
		 "  o.uv = r.xy + float2(q.x, 1.0 - q.y) * r.zw; return o; }\n"
		 "fragment float4 pt_fs(V i [[stage_in]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {\n"
		 "  return float4(t.sample(s, i.uv).rgb, 1.0); }\n";

- (BOOL)prepare:(id<MTLDevice>)device {
	if (self.device == device && self.sampler != nil && self.event != nil) return YES;
	self.device = device;
	@synchronized(self.pipelines) {
		[self.pipelines removeAllObjects];
	}
	MTLSamplerDescriptor *sd = [MTLSamplerDescriptor new];
	sd.minFilter = MTLSamplerMinMagFilterLinear;
	sd.magFilter = MTLSamplerMinMagFilterLinear;
	sd.sAddressMode = MTLSamplerAddressModeClampToEdge;
	sd.tAddressMode = MTLSamplerAddressModeClampToEdge;
	self.sampler = [device newSamplerStateWithDescriptor:sd];
	self.event = [device newSharedEvent];
	self.ownQueue = [device newCommandQueue];
	self.ownQueue.label = @"Pallet TV presenter";
	if (self.layer) self.layer.device = device;
	return self.sampler != nil && self.event != nil && self.ownQueue != nil;
}

- (id<MTLRenderPipelineState>)pipelineFor:(MTLPixelFormat)fmt {
	@synchronized(self.pipelines) {
		id<MTLRenderPipelineState> p = self.pipelines[@(fmt)];
		if (p) return p;
		NSError *err = nil;
		id<MTLLibrary> lib = [self.device newLibraryWithSource:kShader options:nil error:&err];
		if (lib == nil) {
			NSLog(@"[tv] shader: %@", err);
			return nil;
		}
		MTLRenderPipelineDescriptor *d = [MTLRenderPipelineDescriptor new];
		d.vertexFunction = [lib newFunctionWithName:@"pt_vs"];
		d.fragmentFunction = [lib newFunctionWithName:@"pt_fs"];
		d.colorAttachments[0].pixelFormat = fmt;
		p = [self.device newRenderPipelineStateWithDescriptor:d error:&err];
		if (p == nil) {
			NSLog(@"[tv] pipeline: %@", err);
			return nil;
		}
		self.pipelines[@(fmt)] = p;
		return p;
	}
}

static BOOL pt_is_srgb(MTLPixelFormat f) {
	return f == MTLPixelFormatRGBA8Unorm_sRGB || f == MTLPixelFormatBGRA8Unorm_sRGB;
}

// one full-screen triangle: src into the pass, cropped to fill (never letterboxed)
- (void)draw:(id<MTLTexture>)src into:(MTLRenderPassDescriptor *)rp size:(CGSize)ds format:(MTLPixelFormat)fmt on:(id<MTLCommandBuffer>)cb {
	id<MTLRenderPipelineState> pipe = [self pipelineFor:fmt];
	id<MTLRenderCommandEncoder> enc = [cb renderCommandEncoderWithDescriptor:rp];
	if (pipe && src) {
		float sa = (float)src.width / (float)MAX(1, src.height);
		float da = (float)(ds.width / MAX(1.0, ds.height));
		float r[4] = {0.0f, 0.0f, 1.0f, 1.0f};
		if (sa > da * 1.001f) {
			r[2] = da / sa;
			r[0] = (1.0f - r[2]) * 0.5f;
		} else if (da > sa * 1.001f) {
			r[3] = sa / da;
			r[1] = (1.0f - r[3]) * 0.5f;
		}
		[enc setRenderPipelineState:pipe];
		[enc setVertexBytes:r length:sizeof(r) atIndex:0];
		[enc setFragmentTexture:src atIndex:0];
		[enc setFragmentSamplerState:self.sampler atIndex:0];
		[enc drawPrimitives:MTLPrimitiveTypeTriangle vertexStart:0 vertexCount:3];
	}
	[enc endEncoding];
}

// main thread: the engine's newest frame into a slot
- (void)capture {
	id<MTLTexture> src = self.sourceView;
	if (!self.active || src == nil || self.layer == nil) return;
	id<MTLCommandQueue> q = self.queue;
	if (q == nil || q.device != src.device) return;   // (no engine queue: nothing safe to order against)
	if (![self prepare:src.device]) return;
	MTLPixelFormat fmt = pt_is_srgb(src.pixelFormat) ? MTLPixelFormatBGRA8Unorm_sRGB : MTLPixelFormatBGRA8Unorm;
	self.slotFormat = fmt;
	int i = -1;
	BOOL dropped = NO;
	os_unfair_lock_lock(&lk);
	for (int k = 0; k < PT_SLOTS; k++) if (state[k] == SLOT_FREE) { i = k; break; }
	if (i < 0) {
		// every slot taken: the oldest frame still waiting gives way to this one
		uint64_t best = UINT64_MAX;
		for (int k = 0; k < PT_SLOTS; k++) if (state[k] == SLOT_READY && seq[k] < best) { best = seq[k]; i = k; }
		dropped = i >= 0;
	}
	if (i >= 0) state[i] = SLOT_WRITING;
	if (dropped) self.nSkipped += 1;
	id<MTLTexture> t = i >= 0 ? slot[i] : nil;
	os_unfair_lock_unlock(&lk);
	if (i < 0) {
		os_unfair_lock_lock(&lk);
		self.nSkipped += 1;
		os_unfair_lock_unlock(&lk);
		return;
	}
	if (t == nil || t.width != src.width || t.height != src.height || t.pixelFormat != fmt) {
		MTLTextureDescriptor *d = [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:fmt width:src.width height:src.height mipmapped:NO];
		d.usage = MTLTextureUsageRenderTarget | MTLTextureUsageShaderRead;
		d.storageMode = MTLStorageModePrivate;
		t = [src.device newTextureWithDescriptor:d];
	}
	id<MTLCommandBuffer> cb = [q commandBuffer];
	cb.label = @"Pallet TV capture";
	MTLRenderPassDescriptor *rp = [MTLRenderPassDescriptor renderPassDescriptor];
	rp.colorAttachments[0].texture = t;
	rp.colorAttachments[0].loadAction = MTLLoadActionDontCare;
	rp.colorAttachments[0].storeAction = MTLStoreActionStore;
	[self draw:src into:rp size:CGSizeMake(t.width, t.height) format:fmt on:cb];
	os_unfair_lock_lock(&lk);
	uint64_t v = ++_eventValue;
	os_unfair_lock_unlock(&lk);
	[cb encodeSignalEvent:self.event value:v];
	[cb commit];
	os_unfair_lock_lock(&lk);
	slot[i] = t;
	value[i] = v;
	seq[i] = ++_seqNext;
	state[i] = SLOT_READY;
	os_unfair_lock_unlock(&lk);
}

// presenter thread, every TV refresh: the oldest ready frame to the TV
- (void)tick:(CADisplayLink *)link {
	CFTimeInterval ts = link.timestamp;
	os_unfair_lock_lock(&lk);
	if (self.lastStamp > 0) {
		double d = ts - self.lastStamp;
		if (d > 0.001 && d < 0.5) {
			self.period = self.period > 0 ? self.period * 0.9 + d * 0.1 : d;
			self.pMin = self.pMin > 0 ? MIN(self.pMin, d) : d;
			self.pMax = MAX(self.pMax, d);
		}
	}
	self.lastStamp = ts;
	self.ticks = MIN(self.ticks + 1, 8);
	self.nTicks += 1;
	if (self.statAt == 0) self.statAt = ts;
	if (ts - self.statAt >= 1.0) {
		double k = 1.0 / (ts - self.statAt);
		self.rPresented = self.nPresented * k; self.rRepeated = self.nRepeated * k;
		self.rSkipped = self.nSkipped * k; self.rLate = self.nLate * k;
		self.rLink = self.period > 0 ? 1.0 / self.period : self.nTicks * k;
		self.rLinkMin = self.pMax > 0 ? 1.0 / self.pMax : 0; self.rLinkMax = self.pMin > 0 ? 1.0 / self.pMin : 0;
		self.rGap = self.gapMax * 1000.0;
		self.rBlit = self.nBlit > 0 ? self.blitAcc / self.nBlit * 1000.0 : 0;
		self.nTicks = self.nPresented = self.nRepeated = self.nSkipped = self.nLate = self.nBlit = 0;
		self.pMin = self.pMax = self.gapMax = self.blitAcc = 0;
		self.statAt = ts;
	}
	CAMetalLayer *layer = self.layer;
	BOOL on = self.active;
	int i = -1;
	uint64_t best = UINT64_MAX;
	int waiting = 0;
	for (int k = 0; k < PT_SLOTS; k++) if (state[k] == SLOT_READY) { waiting++; if (seq[k] < best) { best = seq[k]; i = k; } }
	if (waiting > 1) self.nLate += 1;    // a frame waits a refresh more (a burst, or a late refresh)
	if (on && i < 0 && self.lastShown > 0) self.nRepeated += 1;   // the TV keeps the last frame
	if (i >= 0) state[i] = SLOT_SHOWING;
	id<MTLTexture> t = i >= 0 ? slot[i] : nil;
	uint64_t v = i >= 0 ? value[i] : 0;
	os_unfair_lock_unlock(&lk);
	if (layer == nil) {
		if (i >= 0) [self releaseSlot:i];
		return;
	}
	if (!on) {
		if (i >= 0) [self releaseSlot:i];
		if (!self.cleared && self.device) [self clearLayer:layer];
		return;
	}
	if (t == nil) return;
	if (layer.device != t.device) layer.device = t.device;
	MTLPixelFormat fmt = t.pixelFormat;
	if (layer.pixelFormat != fmt) layer.pixelFormat = fmt;
	CGSize ds = layer.drawableSize;
	if (ds.width < 1 || ds.height < 1) {
		[self releaseSlot:i];
		return;
	}
	id<CAMetalDrawable> drawable = [layer nextDrawable];   // (may wait here: off the game's thread)
	if (drawable == nil) {
		os_unfair_lock_lock(&lk);
		state[i] = SLOT_READY;
		os_unfair_lock_unlock(&lk);
		return;
	}
	id<MTLCommandBuffer> cb = [self.ownQueue commandBuffer];
	cb.label = @"Pallet TV present";
	[cb encodeWaitForEvent:self.event value:v];
	MTLRenderPassDescriptor *rp = [MTLRenderPassDescriptor renderPassDescriptor];
	rp.colorAttachments[0].texture = drawable.texture;
	rp.colorAttachments[0].loadAction = MTLLoadActionDontCare;
	rp.colorAttachments[0].storeAction = MTLStoreActionStore;
	[self draw:t into:rp size:ds format:fmt on:cb];
	[cb presentDrawable:drawable];
	__weak PTTV *weak = self;
	int si = i;
	[cb addCompletedHandler:^(id<MTLCommandBuffer> b) {
		PTTV *me = weak;
		if (me == nil) return;
		os_unfair_lock_lock(&me->lk);
		double g = b.GPUEndTime - b.GPUStartTime;
		if (g > 0 && g < 1.0) { me.blitAcc += g; me.nBlit += 1; }
		os_unfair_lock_unlock(&me->lk);
		[me releaseSlot:si];
	}];
	[cb commit];
	CFTimeInterval now = CACurrentMediaTime();
	os_unfair_lock_lock(&lk);
	if (self.lastShown > 0) self.gapMax = MAX(self.gapMax, now - self.lastShown);
	self.lastShown = now;
	self.nPresented += 1;
	os_unfair_lock_unlock(&lk);
	self.frames += 1;
	self.cleared = NO;
}

- (void)releaseSlot:(int)i {
	os_unfair_lock_lock(&lk);
	if (state[i] == SLOT_SHOWING) state[i] = SLOT_FREE;
	os_unfair_lock_unlock(&lk);
}

- (void)clearLayer:(CAMetalLayer *)layer {
	if (self.ownQueue == nil) return;
	if (layer.device == nil) layer.device = self.device;
	id<CAMetalDrawable> drawable = [layer nextDrawable];
	if (drawable == nil) return;
	id<MTLCommandBuffer> cb = [self.ownQueue commandBuffer];
	MTLRenderPassDescriptor *rp = [MTLRenderPassDescriptor renderPassDescriptor];
	rp.colorAttachments[0].texture = drawable.texture;
	rp.colorAttachments[0].loadAction = MTLLoadActionClear;
	rp.colorAttachments[0].clearColor = MTLClearColorMake(0, 0, 0, 1);
	rp.colorAttachments[0].storeAction = MTLStoreActionStore;
	[[cb renderCommandEncoderWithDescriptor:rp] endEncoding];
	[cb presentDrawable:drawable];
	[cb commit];
	self.cleared = YES;
}

- (void)setSourceTexture:(id<MTLTexture>)t queue:(id<MTLCommandQueue>)q {
	if (t != self.source) {
		self.source = t;
		self.sourceView = nil;
		if (t != nil) {
			if (t.textureType == MTLTextureType2D) {
				self.sourceView = t;
			} else if (t.textureType == MTLTextureType2DArray) {
				self.sourceView = [t newTextureViewWithPixelFormat:t.pixelFormat textureType:MTLTextureType2D levels:NSMakeRange(0, 1) slices:NSMakeRange(0, 1)];
			} else {
				NSLog(@"[tv] unexpected source texture type %lu", (unsigned long)t.textureType);
			}
		}
	}
	self.queue = q;
}

- (void)showPickerAt:(CGRect)r {
	UIWindowScene *ps = pt_phone_scene();
	UIWindow *w = nil;
	if (@available(iOS 15.0, *)) w = ps.keyWindow;
	if (w == nil) w = ps.windows.firstObject;
	UIView *host = w.rootViewController.view ?: w;
	if (host == nil) return;
	if (self.picker == nil) {
		AVRoutePickerView *p = [[AVRoutePickerView alloc] initWithFrame:r];
		p.prioritizesVideoDevices = YES;
		p.activeTintColor = UIColor.systemYellowColor;
		p.tintColor = UIColor.clearColor;
		p.backgroundColor = UIColor.clearColor;
		p.alpha = 0.011;   // (in the hierarchy and hit-testable for the popover's anchor, but unseen)
		self.picker = p;
	}
	if (self.picker.superview != host) [host addSubview:self.picker];
	self.picker.frame = r;
	// the picker's own button opens the system sheet of AirPlay receivers
	UIButton *btn = nil;
	NSMutableArray<UIView *> *front = [NSMutableArray arrayWithObject:self.picker];
	while (front.count > 0 && btn == nil) {
		UIView *v = front.firstObject;
		[front removeObjectAtIndex:0];
		if ([v isKindOfClass:[UIButton class]]) btn = (UIButton *)v;
		else [front addObjectsFromArray:v.subviews];
	}
	if (btn) [btn sendActionsForControlEvents:UIControlEventTouchUpInside];
	else NSLog(@"[tv] the route picker has no button");
}

@end

// ---------- the C API ----------
static void pt_copy(char *dst, size_t n, NSString *s) {
	const char *u = s.UTF8String ?: "";
	strncpy(dst, u, n - 1);
	dst[n - 1] = 0;
}

void pt_tv_status(pt_tv_status_t *out) {
	memset(out, 0, sizeof(*out));
	pt_install();
	PTTV *tv = [PTTV shared];
	out->supported = 1;
	out->generation = tv.generation;
	out->frames = tv.frames;
	os_unfair_lock_lock(&tv->lk);
	out->link_hz = tv.rLink;
	out->link_min = tv.rLinkMin;
	out->link_max = tv.rLinkMax;
	out->presented = tv.rPresented;
	out->repeated = tv.rRepeated;
	out->skipped = tv.rSkipped;
	out->late = tv.rLate;
	out->gap_ms = tv.rGap;
	out->blit_ms = tv.rBlit;
	os_unfair_lock_unlock(&tv->lk);
	pt_copy(out->route, sizeof(out->route), @"none");
	// sound on an AirPlay receiver (the system picker, or AirPlay audio) but no screen
	for (AVAudioSessionPortDescription *p in AVAudioSession.sharedInstance.currentRoute.outputs) {
		if ([p.portType isEqualToString:AVAudioSessionPortAirPlay]) {
			out->audio_airplay = 1;
			pt_copy(out->name, sizeof(out->name), p.portName);
		}
	}
	UIWindowScene *s = tv.scene;
	if (s == nil || tv.window == nil) return;
	UIScreen *screen = s.screen;
	CGSize px = screen.currentMode ? screen.currentMode.size : CGSizeMake(screen.bounds.size.width * screen.scale, screen.bounds.size.height * screen.scale);
	out->connected = 1;
	out->width = (int)px.width;
	out->height = (int)px.height;
	out->scale = screen.scale;
	out->hz = (int)screen.maximumFramesPerSecond;
	UIEdgeInsets in = screen.overscanCompensationInsets;
	double k = screen.bounds.size.width > 0 ? px.width / screen.bounds.size.width : screen.scale;
	out->inset_l = in.left * k;
	out->inset_t = in.top * k;
	out->inset_r = in.right * k;
	out->inset_b = in.bottom * k;
	NSString *name = @"";
	NSString *route = @"other";
	for (AVAudioSessionPortDescription *p in AVAudioSession.sharedInstance.currentRoute.outputs) {
		if ([p.portType isEqualToString:AVAudioSessionPortAirPlay]) {
			name = p.portName;
			route = @"airplay";
			break;
		}
		if ([p.portType isEqualToString:AVAudioSessionPortHDMI]) {
			name = p.portName;
			route = @"hdmi";
		}
	}
	if (name.length == 0) name = [route isEqualToString:@"other"] ? @"External display" : @"TV";
	pt_copy(out->name, sizeof(out->name), name);
	pt_copy(out->route, sizeof(out->route), route);
}

void pt_tv_set_source(uint64_t texture, uint64_t queue) {
	id<MTLTexture> t = texture ? (__bridge id<MTLTexture>)(void *)(uintptr_t)texture : nil;
	id<MTLCommandQueue> q = queue ? (__bridge id<MTLCommandQueue>)(void *)(uintptr_t)queue : nil;
	if (t != nil && ![(id)t conformsToProtocol:@protocol(MTLTexture)]) t = nil;
	if (q != nil && ![(id)q conformsToProtocol:@protocol(MTLCommandQueue)]) q = nil;
	[[PTTV shared] setSourceTexture:t queue:q];
}

void pt_tv_frame_drawn(void) {
	[[PTTV shared] capture];
}

int pt_tv_take_ticks(void) {
	PTTV *tv = [PTTV shared];
	os_unfair_lock_lock(&tv->lk);
	int n = tv.ticks;
	tv.ticks = 0;
	os_unfair_lock_unlock(&tv->lk);
	return n;
}

void pt_tv_set_mode_height(int h) {
	PTTV *tv = [PTTV shared];
	if (tv.wantHeight == h) return;
	tv.wantHeight = h;
	if (tv.scene) [tv applyMode];
}

void pt_tv_set_active(int on) {
	PTTV *tv = [PTTV shared];
	if (tv.active == (on != 0)) return;
	tv.active = on != 0;
	tv.cleared = NO;
}

void pt_tv_show_route_picker(double x, double y, double w, double h) {
	[[PTTV shared] showPickerAt:CGRectMake(x, y, MAX(w, 44.0), MAX(h, 44.0))];
}
