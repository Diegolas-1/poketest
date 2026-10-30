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

## earth_atlas.webp
Eight photo soils, made into painted detail for the earth faces (stream banks,
Route 1's ledges, the dirt under a turf lip), the ground's steep earth and the
paths' soils by tools/world/earth_atlas.py (softened, posterised into three
tones, a little of the photo's hue, normalised so mid grey = the vertex colour).
2048 x 1024, 4 x 2 tiles of 512 px (480 px of picture in a 16 px wrapped border):

| tile | soil | source | author | licence |
| --- | --- | --- | --- | --- |
| 0 | dark loam | ambientCG "Ground 048" https://ambientcg.com/view?id=Ground048 | ambientCG (Lennart Demes) | CC0 1.0 |
| 1 | sandy soil | ambientCG "Ground 079 S" https://ambientcg.com/view?id=Ground079S | ambientCG (Lennart Demes) | CC0 1.0 |
| 2 | clay | Poly Haven "Red Laterite Soil Stones" https://polyhaven.com/a/red_laterite_soil_stones | Amal Kumar | CC0 1.0 |
| 3 | gravelly dirt | Poly Haven "Brown Mud Rocks 01" https://polyhaven.com/a/brown_mud_rocks_01 | Rob Tuytel | CC0 1.0 |
| 4 | rooty soil | ambientCG "Ground 084" https://ambientcg.com/view?id=Ground084 | ambientCG (Lennart Demes) | CC0 1.0 |
| 5 | eroded layered silt | ambientCG "Ground 094 A" https://ambientcg.com/view?id=Ground094A | ambientCG (Lennart Demes) | CC0 1.0 |
| 6 | eroded dark clay | ambientCG "Ground 100" https://ambientcg.com/view?id=Ground100 | ambientCG (Lennart Demes) | CC0 1.0 |
| 7 | forest soil | ambientCG "Ground 082 S" https://ambientcg.com/view?id=Ground082S | ambientCG (Lennart Demes) | CC0 1.0 |

Licences: https://docs.ambientcg.com/license/ (CC0 1.0) and https://polyhaven.com/license (CC0 1.0).
