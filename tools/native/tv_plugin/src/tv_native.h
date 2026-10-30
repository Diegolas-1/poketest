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
	char name[128];     // the AirPlay receiver's or adapter's name, UTF-8
	char route[32];     // "airplay", "hdmi", "other"
} pt_tv_status_t;

void pt_tv_status(pt_tv_status_t *out);
// the frame to show: an MTLTexture* and the engine's MTLCommandQueue* (0 = none)
void pt_tv_set_source(uint64_t texture, uint64_t queue);
// a new frame was drawn into the source texture: the next TV refresh shows it
void pt_tv_frame_drawn(void);
// on: the game fills the TV; off: the TV shows black (the game is back on the phone)
void pt_tv_set_active(int on);
// the system AirPlay picker, anchored to this rect of the phone screen (points)
void pt_tv_show_route_picker(double x, double y, double w, double h);

#ifdef __cplusplus
}
#endif
