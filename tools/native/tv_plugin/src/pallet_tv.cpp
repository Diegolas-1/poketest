// The engine singleton "PalletTV": GDScript's handle on the TV output
// (native/tv/tv_link.gd). Everything real happens in tv_ios.m; this file only
// turns its plain C calls into bound methods.
#include "tv_native.h"

#include <gdextension_interface.h>
#include <godot_cpp/classes/engine.hpp>
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/core/defs.hpp>
#include <godot_cpp/godot.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/rect2.hpp>
#include <godot_cpp/variant/string.hpp>

using namespace godot;

class PalletTV : public Object {
	GDCLASS(PalletTV, Object)

protected:
	static void _bind_methods() {
		ClassDB::bind_method(D_METHOD("get_status"), &PalletTV::get_status);
		ClassDB::bind_method(D_METHOD("set_source", "texture", "queue"), &PalletTV::set_source);
		ClassDB::bind_method(D_METHOD("frame_drawn"), &PalletTV::frame_drawn);
		ClassDB::bind_method(D_METHOD("set_active", "on"), &PalletTV::set_active);
		ClassDB::bind_method(D_METHOD("show_route_picker", "rect_points"), &PalletTV::show_route_picker);
		ClassDB::bind_method(D_METHOD("get_version"), &PalletTV::get_version);
	}

public:
	Dictionary get_status() const {
		pt_tv_status_t s;
		pt_tv_status(&s);
		Dictionary d;
		d["supported"] = s.supported != 0;
		d["connected"] = s.connected != 0;
		d["width"] = s.width;
		d["height"] = s.height;
		d["scale"] = s.scale;
		d["hz"] = s.hz;
		d["frames"] = s.frames;
		d["generation"] = s.generation;
		d["insets"] = Rect2(s.inset_l, s.inset_t, s.inset_r, s.inset_b);
		d["name"] = String::utf8(s.name);
		d["route"] = String(s.route);
		return d;
	}
	void set_source(int64_t texture, int64_t queue) { pt_tv_set_source((uint64_t)texture, (uint64_t)queue); }
	void frame_drawn() { pt_tv_frame_drawn(); }
	void set_active(bool on) { pt_tv_set_active(on ? 1 : 0); }
	void show_route_picker(const Rect2 &r) { pt_tv_show_route_picker(r.position.x, r.position.y, r.size.x, r.size.y); }
	int64_t get_version() const { return 1; }
};

static PalletTV *singleton = nullptr;

static void initialize(ModuleInitializationLevel p_level) {
	if (p_level != MODULE_INITIALIZATION_LEVEL_SCENE) return;
	GDREGISTER_CLASS(PalletTV);
	singleton = memnew(PalletTV);
	Engine::get_singleton()->register_singleton("PalletTV", singleton);
}

static void uninitialize(ModuleInitializationLevel p_level) {
	if (p_level != MODULE_INITIALIZATION_LEVEL_SCENE) return;
	if (singleton) {
		pt_tv_set_active(0);
		pt_tv_set_source(0, 0);
		Engine::get_singleton()->unregister_singleton("PalletTV");
		memdelete(singleton);
		singleton = nullptr;
	}
}

extern "C" {
GDExtensionBool GDE_EXPORT pallet_tv_init(GDExtensionInterfaceGetProcAddress p_get_proc_address, const GDExtensionClassLibraryPtr p_library, GDExtensionInitialization *r_initialization) {
	GDExtensionBinding::InitObject init_obj(p_get_proc_address, p_library, r_initialization);
	init_obj.register_initializer(initialize);
	init_obj.register_terminator(uninitialize);
	init_obj.set_minimum_library_initialization_level(MODULE_INITIALIZATION_LEVEL_SCENE);
	return init_obj.init();
}
}
