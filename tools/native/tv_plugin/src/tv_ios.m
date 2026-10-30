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
// (native/screens.gd). Its colour texture (an MTLTexture, from
// RenderingServer.texture_get_native_handle) and the engine's own MTLCommandQueue
// (RenderingDevice.get_driver_resource) are handed over with pt_tv_set_source. At
// every refresh of the TV (a display link on the TV's own screen, so the TV paces
// itself) the newest frame is drawn into the layer with one full-screen triangle.
// Everything stays on the GPU. The command buffer goes on the engine's queue,
// after the engine's frame, so Metal orders the read after the engine's writes
// and the engine's next frame after the read (the engine's textures are hazard
// tracked); all of it runs on the main thread, between engine frames.
//
// The phone keeps the engine's own view; screens.gd draws the phone UI there.

#import "tv_native.h"

#import <AVFoundation/AVFoundation.h>
#import <AVKit/AVKit.h>
#import <Metal/Metal.h>
#import <QuartzCore/QuartzCore.h>
#import <UIKit/UIKit.h>
#import <objc/message.h>
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
@interface PTTV : NSObject
@property(nonatomic, strong) UIWindowScene *scene;
@property(nonatomic, strong) UIWindow *window;
@property(nonatomic, strong) CAMetalLayer *layer;
@property(nonatomic, strong) CADisplayLink *link;
@property(nonatomic, strong) id<MTLTexture> source;
@property(nonatomic, strong) id<MTLTexture> sourceView;   // a 2D view when the source is an array
@property(nonatomic, strong) id<MTLCommandQueue> queue;
@property(nonatomic, strong) id<MTLCommandQueue> ownQueue;
@property(nonatomic, strong) id<MTLDevice> device;
@property(nonatomic, strong) NSMutableDictionary<NSNumber *, id<MTLRenderPipelineState>> *pipelines;
@property(nonatomic, strong) id<MTLSamplerState> sampler;
@property(nonatomic, strong) AVRoutePickerView *picker;
@property(nonatomic) BOOL active;
@property(nonatomic) BOOL dirty;
@property(nonatomic) BOOL cleared;
@property(nonatomic) int frames;
@property(nonatomic) int generation;
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
		s.pipelines = [NSMutableDictionary new];
	});
	return s;
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
	vc.view.contentScaleFactor = screen.scale;
	self.layer = layer;
	if (self.device) layer.device = self.device;
	[self layout];
	self.cleared = NO;
	self.frames = 0;
	self.generation += 1;
	CADisplayLink *link = [screen displayLinkWithTarget:self selector:@selector(tick:)];
	if (@available(iOS 15.0, *)) {
		float hz = (float)MAX(30, screen.maximumFramesPerSecond);
		link.preferredFrameRateRange = CAFrameRateRangeMake(hz, hz, hz);
	}
	[link addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
	self.link = link;
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

- (void)teardown {
	[self.link invalidate];
	self.link = nil;
	self.window.hidden = YES;
	self.window.rootViewController = nil;
	self.window = nil;
	self.layer = nil;
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
	if (self.device == device && self.sampler != nil) return YES;
	self.device = device;
	[self.pipelines removeAllObjects];
	MTLSamplerDescriptor *sd = [MTLSamplerDescriptor new];
	sd.minFilter = MTLSamplerMinMagFilterLinear;
	sd.magFilter = MTLSamplerMinMagFilterLinear;
	sd.sAddressMode = MTLSamplerAddressModeClampToEdge;
	sd.tAddressMode = MTLSamplerAddressModeClampToEdge;
	self.sampler = [device newSamplerStateWithDescriptor:sd];
	if (self.layer) self.layer.device = device;
	return self.sampler != nil;
}

- (id<MTLRenderPipelineState>)pipelineFor:(MTLPixelFormat)fmt {
	id<MTLRenderPipelineState> p = self.pipelines[@(fmt)];
	if (p) return p;
	NSError *err = nil;
	static id<MTLLibrary> lib = nil;
	static id<MTLDevice> libDevice = nil;
	if (lib == nil || libDevice != self.device) {
		lib = [self.device newLibraryWithSource:kShader options:nil error:&err];
		libDevice = self.device;
		if (lib == nil) {
			NSLog(@"[tv] shader: %@", err);
			return nil;
		}
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

static BOOL pt_is_srgb(MTLPixelFormat f) {
	switch (f) {
		case MTLPixelFormatRGBA8Unorm_sRGB:
		case MTLPixelFormatBGRA8Unorm_sRGB:
			return YES;
		default:
			return NO;
	}
}

- (void)tick:(CADisplayLink *)link {
	CAMetalLayer *layer = self.layer;
	if (layer == nil) return;
	id<MTLTexture> src = self.active ? self.sourceView : nil;
	// nothing new to show (the TV keeps its last picture), or black shown already
	if (src != nil && !self.dirty) return;
	if (src == nil && self.cleared) return;
	id<MTLCommandQueue> q = self.queue;
	id<MTLDevice> dev = src ? src.device : (q ? q.device : (self.device ? self.device : MTLCreateSystemDefaultDevice()));
	if (dev == nil || ![self prepare:dev]) return;
	if (q == nil || q.device != dev) {
		if (self.ownQueue == nil || self.ownQueue.device != dev) self.ownQueue = [dev newCommandQueue];
		q = self.ownQueue;
	}
	MTLPixelFormat fmt = (src && pt_is_srgb(src.pixelFormat)) ? MTLPixelFormatBGRA8Unorm_sRGB : MTLPixelFormatBGRA8Unorm;
	if (layer.pixelFormat != fmt) layer.pixelFormat = fmt;
	if (layer.device != dev) layer.device = dev;
	CGSize ds = layer.drawableSize;
	if (ds.width < 1 || ds.height < 1) {
		[self layout];
		ds = layer.drawableSize;
		if (ds.width < 1 || ds.height < 1) return;
	}
	id<MTLRenderPipelineState> pipe = src ? [self pipelineFor:fmt] : nil;
	if (src && pipe == nil) return;
	id<CAMetalDrawable> drawable = [layer nextDrawable];
	if (drawable == nil) return;
	id<MTLCommandBuffer> cb = [q commandBuffer];
	cb.label = @"Pallet TV";
	MTLRenderPassDescriptor *rp = [MTLRenderPassDescriptor renderPassDescriptor];
	rp.colorAttachments[0].texture = drawable.texture;
	rp.colorAttachments[0].loadAction = src ? MTLLoadActionDontCare : MTLLoadActionClear;
	rp.colorAttachments[0].clearColor = MTLClearColorMake(0, 0, 0, 1);
	rp.colorAttachments[0].storeAction = MTLStoreActionStore;
	id<MTLRenderCommandEncoder> enc = [cb renderCommandEncoderWithDescriptor:rp];
	if (src) {
		// fill the screen: the source has the TV's shape already; a mismatch
		// (for a frame while it resizes) is cropped, never letterboxed
		float sa = (float)src.width / (float)MAX(1, src.height);
		float da = (float)(ds.width / ds.height);
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
	[cb presentDrawable:drawable];
	[cb commit];
	if (src) {
		self.dirty = NO;
		self.cleared = NO;
		self.frames += 1;
	} else {
		self.cleared = YES;
	}
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
		self.dirty = t != nil;
	}
	self.queue = q;
	if (t == nil) self.cleared = NO;
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
	pt_copy(out->route, sizeof(out->route), @"none");
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
	[PTTV shared].dirty = YES;
}

void pt_tv_set_active(int on) {
	PTTV *tv = [PTTV shared];
	if (tv.active == (on != 0)) return;
	tv.active = on != 0;
	tv.cleared = NO;
	tv.dirty = YES;
}

void pt_tv_show_route_picker(double x, double y, double w, double h) {
	[[PTTV shared] showPickerAt:CGRectMake(x, y, MAX(w, 44.0), MAX(h, 44.0))];
}
