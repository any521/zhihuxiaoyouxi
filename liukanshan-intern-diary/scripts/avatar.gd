extends TextureRect
## Shared fixed-size circular avatar. Sampling crops the source, never stretches it.

const PORTRAITS := {
	"刘看山": "res://assets/avatars/liukanshan.png",
	"林总": "res://assets/avatars/lin.jpg",
	"周岚": "res://assets/avatars/zhou.jpg",
	"阿麦": "res://assets/avatars/amai.jpg",
	"韩策": "res://assets/avatars/han.jpg",
	"小鹿": "res://assets/avatars/lu.jpg"
}
static var textures: Dictionary = {}
static var circle_shader: Shader


static func portrait(person: String) -> Texture2D:
	if textures.has(person):
		return textures[person]
	var result: Texture2D
	if PORTRAITS.has(person):
		result = load(PORTRAITS[person]) as Texture2D
	elif person.contains("群"):
		var mosaic := Image.create(128, 128, false, Image.FORMAT_RGBA8)
		mosaic.fill(Color("#dedede"))
		var members := ["林总", "周岚", "阿麦", "刘看山"]
		for i in range(4):
			var source := portrait(members[i]).get_image()
			var side := mini(source.get_width(), source.get_height())
			var square := source.get_region(Rect2i((source.get_width() - side) / 2, (source.get_height() - side) / 2, side, side))
			square.convert(Image.FORMAT_RGBA8)
			square.resize(60, 60, Image.INTERPOLATE_LANCZOS)
			mosaic.blit_rect(square, Rect2i(0, 0, 60, 60), Vector2i(3 + (i % 2) * 62, 3 + (i / 2) * 62))
		result = ImageTexture.create_from_image(mosaic)
	else:
		# Distinct neutral avatar for later characters without supplied art.
		var placeholder := Image.new()
		placeholder.load_svg_from_string('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#b8c8d3"/><circle cx="64" cy="46" r="22" fill="#f7fafc"/><path d="M22 124V108a42 42 0 0 1 84 0v16" fill="#f7fafc"/></svg>')
		result = ImageTexture.create_from_image(placeholder)
	textures[person] = result
	return result


func setup(person: String, diameter: int = 44, override_texture: Texture2D = null) -> void:
	name = "Avatar"
	tooltip_text = person
	custom_minimum_size = Vector2(diameter, diameter)
	size = custom_minimum_size
	size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	stretch_mode = TextureRect.STRETCH_SCALE
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	texture = override_texture if override_texture != null else portrait(person)
	if circle_shader == null:
		circle_shader = Shader.new()
		circle_shader.code = """shader_type canvas_item;
uniform float source_aspect = 1.0;
uniform float edge = 0.0227;
void fragment() {
    vec2 sample_uv = UV;
    if (source_aspect > 1.0) { sample_uv.x = (UV.x - 0.5) / source_aspect + 0.5; }
    else { sample_uv.y = (UV.y - 0.5) * source_aspect + 0.5; }
    vec4 color = texture(TEXTURE, sample_uv);
    color.a *= 1.0 - smoothstep(0.5 - edge, 0.5, length(UV - vec2(0.5)));
    COLOR = color;
}"""
	var mask := ShaderMaterial.new()
	mask.shader = circle_shader
	mask.set_shader_parameter("source_aspect", float(texture.get_width()) / float(texture.get_height()))
	mask.set_shader_parameter("edge", 1.0 / float(diameter))
	material = mask
