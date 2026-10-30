// Desktop stand-in for tv_ios.m (bindings test only): never connected.
#include "tv_native.h"
#include <string.h>

void pt_tv_status(pt_tv_status_t *out) {
	memset(out, 0, sizeof(*out));
	strcpy(out->route, "none");
}
void pt_tv_set_source(uint64_t texture, uint64_t queue) { (void)texture; (void)queue; }
void pt_tv_frame_drawn(void) {}
void pt_tv_set_active(int on) { (void)on; }
void pt_tv_show_route_picker(double x, double y, double w, double h) { (void)x; (void)y; (void)w; (void)h; }
