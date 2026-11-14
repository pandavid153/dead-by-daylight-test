extends Node3D

const ARENA_SIZE := 96.0
const TILE_SPACING := 22.0
const AGENT_SCENE := preload("res://agent.gd")

var rng := RandomNumberGenerator.new()
var player: MatchAgent
var generators: Array[Node3D] = []
var hooks: Array[Node3D] = []
var survivors: Array[MatchAgent] = []
var killer: MatchAgent
var hud: Label
var repaired := 0
var match_over := false

func _ready() -> void:
	rng.seed = 101
	_build_lighting()
	_build_floor()
	_build_perimeter()
	_build_tiles()
	_build_objectives()
	_spawn_team()
	_build_hud()

func _process(delta: float) -> void:
	if match_over:
		_update_hud()
		return
	for index in generators.size():
		var generator := generators[index]
		var workers := survivors.filter(func(survivor): return survivor.global_position.distance_to(generator.global_position) < 2.0 and survivor.has_destination == false)
		if workers.size() > 0 and generator.get_meta("done") == false:
			var progress: float = generator.get_meta("progress")
			progress = minf(1.0, progress + delta * (1.0 + .15 * (workers.size() - 1)) / 100.0)
			generator.set_meta("progress", progress)
			if progress >= 1.0:
				generator.set_meta("done", true)
				repaired += 1
	if Input.is_key_pressed(KEY_E):
		_repair_nearest(delta)
	_update_killer(delta)
	_update_hud()

func _update_killer(_delta: float) -> void:
	if killer.recovery > 0.0:
		return
	var distance := killer.global_position.distance_to(player.global_position)
	if distance > 1.8:
		killer.set_destination(player.global_position)
		return
	killer.has_destination = false
	killer.recovery = 2.0
	player.health_state -= 1
	if player.health_state <= 0:
		match_over = true

func _build_lighting() -> void:
	var world := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("172018")
	environment.fog_enabled = true
	environment.fog_light_color = Color("718270")
	environment.fog_density = 0.018
	world.environment = environment
	add_child(world)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55, -25, 0)
	light.light_color = Color("ffe4b3")
	add_child(light)

func _build_floor() -> void:
	_add_box(Vector3(ARENA_SIZE, 0.2, ARENA_SIZE), Vector3(0, -0.1, 0), Color("344634"), true)

func _build_perimeter() -> void:
	_add_box(Vector3(ARENA_SIZE, 4.0, 1.0), Vector3(0, 2.0, -47.5), Color("30372e"), true)
	_add_box(Vector3(ARENA_SIZE, 4.0, 1.0), Vector3(0, 2.0, 47.5), Color("30372e"), true)
	_add_box(Vector3(1.0, 4.0, ARENA_SIZE), Vector3(-47.5, 2.0, 0), Color("30372e"), true)
	_add_box(Vector3(1.0, 4.0, ARENA_SIZE), Vector3(47.5, 2.0, 0), Color("30372e"), true)

func _build_tiles() -> void:
	var slots := [Vector2(-31, -28), Vector2(-9, -28), Vector2(13, -28), Vector2(33, -28), Vector2(-31, 3), Vector2(-9, 3), Vector2(13, 3), Vector2(-31, 27), Vector2(-9, 27), Vector2(13, 27), Vector2(33, 27)]
	for index in slots.size():
		var point: Vector2 = slots[index]
		var center := Vector3(point.x, 0, point.y)
		match index % 4:
			0:
				_add_box(Vector3(1, 4.8, 9), center + Vector3(-2.5, 2.4, 0), Color("3b4138"), true)
				_add_window_wall(center + Vector3(2, 0, 3.5), 0.0)
			1:
				_add_window_wall(center, 0.0)
				_add_box(Vector3(1, 4.8, 8), center + Vector3(0, 2.4, 4), Color("3b4138"), true)
			2:
				_add_box(Vector3(1, 4.8, 8), center + Vector3(-3, 2.4, 0), Color("3b4138"), true)
				_add_window_wall(center + Vector3(3, 0, 0), PI * 0.5)
			_:
				_add_box(Vector3(7, 4.8, 1), center + Vector3(0, 2.4, -3.5), Color("3b4138"), true)
				_add_window_wall(center + Vector3(0, 0, 3.5), 0.0)

func _add_window_wall(center: Vector3, rotation_y: float) -> void:
	# Two wall segments leave a 2.4m opening. The low sill is physical: traversal must vault.
	var axis := Vector3.RIGHT.rotated(Vector3.UP, rotation_y)
	for side in [-1.0, 1.0]:
		var position: Vector3 = center + axis * side * 3.0 + Vector3(0, 2.4, 0)
		var size := Vector3(3.6, 4.8, 0.7)
		if abs(rotation_y) > 0.1:
			size = Vector3(0.7, 4.8, 3.6)
		_add_box(size, position, Color("3b4138"), true)
	var sill := Vector3(2.4, 1.0, 0.7)
	if abs(rotation_y) > 0.1:
		sill = Vector3(0.7, 1.0, 2.4)
	_add_box(sill, center + Vector3(0, 0.5, 0), Color("30372e"), true)

func _build_objectives() -> void:
	for point in [Vector3(-25, 0, -10), Vector3(-10, 0, 16), Vector3(8, 0, -17), Vector3(25, 0, 8), Vector3(4, 0, 28), Vector3(-29, 0, 25), Vector3(28, 0, -28)]:
		var generator := _add_box(Vector3(1.7, 2.1, 1.2), point + Vector3(0, 1.05, 0), Color("526b59"), true)
		generator.set_meta("progress", 0.0)
		generator.set_meta("done", false)
		generators.append(generator)
	for point in [Vector3(-40, 0, -35), Vector3(40, 0, 35)]:
		_add_box(Vector3(5.0, 4.8, 0.8), point + Vector3(0, 2.4, 0), Color("876331"), true)
	for point in [Vector3(-20, 0, -25), Vector3(0, 0, -5), Vector3(20, 0, 20), Vector3(-30, 0, 10)]:
		hooks.append(_make_hook(point))

func _spawn_team() -> void:
	player = _make_agent(Vector3(-33, 0.5, -14), false, Color("55a1ae"))
	player.controlled = true
	survivors.append(player)
	for index in 3:
		var points := [Vector3(-31, .5, 0), Vector3(-30, .5, 14), Vector3(-28, .5, 27)]
		var bot := _make_agent(points[index], false, Color("5796a4"))
		bot.set_destination(generators[index].global_position)
		survivors.append(bot)
	killer = _make_agent(Vector3(33, .5, 0), true, Color("a63c32"))
	var camera := Camera3D.new()
	camera.position = Vector3(0, 2.8, 5.0)
	camera.rotation_degrees = Vector3(-12, 180, 0)
	player.add_child(camera)

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	hud = Label.new()
	hud.position = Vector2(24, 20)
	hud.add_theme_font_size_override("font_size", 22)
	layer.add_child(hud)
	add_child(layer)

func _repair_nearest(delta: float) -> void:
	var nearest: Node3D
	var distance := 2.1
	for generator in generators:
		var candidate := player.global_position.distance_to(generator.global_position)
		if candidate < distance and generator.get_meta("done") == false:
			nearest = generator
			distance = candidate
	if nearest:
		var progress: float = nearest.get_meta("progress")
		nearest.set_meta("progress", minf(1.0, progress + delta / 100.0))

func _update_hud() -> void:
	var nearby: float = INF
	for generator in generators:
		nearby = minf(nearby, player.global_position.distance_to(generator.global_position))
	var state := "DYING" if player.health_state <= 0 else "INJURED" if player.health_state == 1 else "HEALTHY"
	hud.text = "GODOT PROTOTYPE\nGENERATORS: %d / 5\nSTATE: %s\nWASD move | Shift sprint | Hold E near a generator\nNearest generator: %.1fm%s" % [repaired, state, nearby, "\nTHE KILLER PREVAILED" if match_over else ""]

func _make_agent(position: Vector3, killer: bool, color: Color) -> MatchAgent:
	var agent := MatchAgent.new()
	agent.position = position
	agent.is_killer = killer
	agent.move_speed = 4.6 if killer else 4.0
	var body := MeshInstance3D.new()
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.38
	capsule.height = 1.8
	body.mesh = capsule
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	body.material_override = material
	agent.add_child(body)
	var collision := CollisionShape3D.new()
	var shape := CapsuleShape3D.new()
	shape.radius = 0.38
	shape.height = 1.8
	collision.shape = shape
	agent.add_child(collision)
	add_child(agent)
	return agent

func _make_hook(position: Vector3) -> Node3D:
	var pillar := _add_box(Vector3(0.42, 4.4, 0.42), position + Vector3(0, 2.2, 0), Color("4b4137"), true)
	_add_box(Vector3(1.35, 0.16, 0.16), position + Vector3(.62, 4.2, 0), Color("534c43"), false)
	return pillar

func _add_box(size: Vector3, position: Vector3, color: Color, collision_enabled: bool) -> Node3D:
	var root: Node3D = StaticBody3D.new() if collision_enabled else Node3D.new()
	root.position = position
	var mesh := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	mesh.mesh = box
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	mesh.material_override = material
	root.add_child(mesh)
	if collision_enabled:
		var collision := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = size
		collision.shape = shape
		root.add_child(collision)
	add_child(root)
	return root
