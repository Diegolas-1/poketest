// Cel shading in the anime background style, the same as the web build's
// toon.js: light falls in flat bands (deep shade, shade, base, lit) and shade
// turns cool instead of grey. The bands replace all lighting: no ambient, no
// specular, only the sun (and its shadows) picks the band.
shader_type spatial;
render_mode ambient_light_disabled;
#include "res://shaders/toon.gdshaderinc"
