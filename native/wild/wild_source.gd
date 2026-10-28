class_name WildSource
extends RefCounted
# Where wild Pokémon come from: an encounter source (wild.gd keeps a list).
# Tall grass is the first (wild_tall_grass.gd); caves, water, trees, the
# roadside come later as more of these, each with the same few calls:
#   id                              the source's name in wild.json (species.<id>.sources.<id>)
#   region(p) -> String             the region at p ("" = none here), for species_for
#   distance(p) -> float            metres from p to this cover (0 inside)
#   contains(p) -> bool             p is inside the cover
#   pick_spot(ash, yaw, dmin, dmax, rng) -> Variant   a spot for one to settle (Vector3, ground height unset), or null
#   patch_of(p) -> int              which patch of cover p is in (-1 none): a fled one picks another
#   safe_spots(from, r) -> Array    hiding places within r: [{at: Vector3, kind}]
#   tells -> String                 how the hiding shows: "grass" (blades twitch) | "leaves" | ...

var id := ""
var tells := "grass"

func region(_p: Vector3) -> String: return ""
func distance(_p: Vector3) -> float: return INF
func contains(p: Vector3) -> bool: return distance(p) <= 0.0
func pick_spot(_ash: Vector3, _yaw: float, _dmin: float, _dmax: float, _rng: RandomNumberGenerator) -> Variant: return null
func patch_of(_p: Vector3) -> int: return -1
func safe_spots(_from: Vector3, _r: float) -> Array: return []
