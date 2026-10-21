# Textures

## dirt_pack.webp
Made from "Dry Ground Rocks" by Rob Tuytel, Poly Haven
https://polyhaven.com/a/dry_ground_rocks
Licence: CC0 1.0 (public domain) https://polyhaven.com/license

Packed for the path shader (1024 x 1024, tiles over 3 m of ground, linear data, not colour):
- R = detail: the photo's luminance and displacement, contrast stretched, times its AO
  (stones and ridges light, cracks and hollows dark)
- G, B = the OpenGL normal map's x and y
The colour comes from our own palette in the shader; only the shapes come from the photo.
