extends Node
# Dev test: dev/conditions_test.gd's checks as a scene (headless):
#   godot --headless --path native res://dev/conditions_test.tscn
func _ready() -> void:
	var code: int = preload("res://dev/conditions_test.gd").run(self)
	get_tree().quit(code)
