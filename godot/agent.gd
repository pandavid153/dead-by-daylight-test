class_name MatchAgent
extends CharacterBody3D

@export var move_speed := 4.0
@export var is_killer := false
@export var controlled := false
var destination := Vector3.ZERO
var has_destination := false
var yaw := 0.0
var health_state := 2
var recovery := 0.0

func set_destination(point: Vector3) -> void:
	destination = point
	has_destination = true

func _physics_process(_delta: float) -> void:
	recovery = maxf(0.0, recovery - _delta)
	if controlled:
		var input := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
		var direction := Vector3(input.x, 0.0, input.y)
		if Input.is_action_pressed("sprint"):
			direction *= 1.0
		velocity = direction.normalized() * (move_speed if not Input.is_action_pressed("sprint") else 4.0)
		if direction.length() > 0.0:
			look_at(global_position + direction, Vector3.UP)
		move_and_slide()
		return
	if not has_destination:
		velocity = Vector3.ZERO
		return
	var flat = destination - global_position
	flat.y = 0.0
	if flat.length() < 0.45:
		has_destination = false
		velocity = Vector3.ZERO
		return
	velocity = flat.normalized() * move_speed
	look_at(global_position + Vector3(velocity.x, 0.0, velocity.z), Vector3.UP)
	move_and_slide()
