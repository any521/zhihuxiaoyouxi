extends RefCounted
## Code-owned line icons avoid desktop font fallback disappearing in Web builds.
static var cache: Dictionary = {}

static func get_icon(kind: String) -> Texture2D:
	if cache.has(kind):
		return cache[kind]
	var path := ""
	match kind:
		"●":
			path = '<path d="M21 11a9 8 0 0 1-9 8H7l-4 3 1-6a8 8 0 0 1-1-5 9 8 0 0 1 18 0Z"/><path d="M7 10h.1M12 10h.1M17 10h.1"/>'
		"♙":
			path = '<rect x="4" y="2" width="17" height="20" rx="2"/><circle cx="12" cy="8" r="3"/><path d="M7 18v-1a5 5 0 0 1 10 0v1M1 7h4M1 12h4M1 17h4"/>'
		"▯":
			path = '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>'
		"☰":
			path = '<path d="M3 5h18M3 12h18M3 19h18"/>'
		"call":
			path = '<path d="m7 3 3 5-3 3a16 16 0 0 0 6 6l3-3 5 3-2 4C10 23 1 14 3 5Z"/>'
		"video":
			path = '<rect x="2" y="5" width="13" height="14" rx="2"/><path d="m15 9 7-4v14l-7-4"/>'
		_:
			path = '<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>'
	var svg := '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="#303030" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + path + '</g></svg>'
	var pixels := Image.new()
	pixels.load_svg_from_string(svg, 2.0)
	var texture := ImageTexture.create_from_image(pixels)
	cache[kind] = texture
	return texture
