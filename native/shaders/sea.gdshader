// The sea as the anime paints it (terrain.js seaFrag): turquoise over sand,
// deep blue further out, white foam bands rolling in, a lapping white edge,
// a slow swell and glints of sun. Depth comes from the baked sea floor.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled;
#include "res://shaders/sea.gdshaderinc"
