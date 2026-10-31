// The TV output's native side, as plain C (tv_ios.m on the phone, tv_stub.c on a
// desktop build used only to test the bindings). pallet_tv.cpp wraps it as the
// engine singleton "PalletTV" for GDScript (native/tv/tv_link.gd).
#pragma once
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
	int supported;      // this device can drive an external display at all
	int connected;      // an external display scene is up (AirPlay, USB-C / HDMI)
	int width, height;  // its current mode in pixels
	double scale;       // its UIScreen scale
	int hz;             // its maximum frames per second
	int frames;         // frames shown on it since it connected
	int generation;     // +1 at every connect and disconnect
	double inset_l, inset_t, inset_r, inset_b;   // overscan insets the system suggests, pixels
	int audio_airplay;  // sound goes to an AirPlay receiver (with or without a screen)
	double link_hz;     // the TV's measured refresh
	double presented, repeated, skipped, late;
	double link_min, link_max;  // the TV's slowest and fastest refresh in the last second, Hz
	double gap_ms;      // the longest time between two frames shown in the last second
	double blit_ms;     // GPU time of a present (the copy into the TV's drawable)   // per second: frames shown, refreshes that showed the last frame again, frames dropped, frames sent at the next refresh
	char name[128];     // the AirPlay receiver's or adapter's name, UTF-8
	char route[32];     // "airplay", "hdmi", "other"
} pt_tv_status_t;

void pt_tv_status(pt_tv_status_t *out);
// the frame to show: an MTLTexture* and the engine's MTLCommandQueue* (0 = none)
void pt_tv_set_source(uint64_t texture, uint64_t queue);
// a new frame was drawn into the source texture: the next TV refresh shows it
void pt_tv_frame_drawn(void);
// TV refreshes since the last call (the game renders one frame per refresh)
int pt_tv_take_ticks(void);
// the TV mode's height to ask for (720, 1080; 0 = the screen's preferred mode)
void pt_tv_set_mode_height(int h);
// on: the game fills the TV; off: the TV shows black (the game is back on the phone)
void pt_tv_set_active(int on);
// the system AirPlay picker, anchored to this rect of the phone screen (points)
void pt_tv_show_route_picker(double x, double y, double w, double h);

#ifdef __cplusplus
}
#endif
