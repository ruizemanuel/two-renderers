// Smallest shader that proves the loader resolves a module and hands it over.
@fragment fn fs_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  return vec4f(frag.xy * 0.0, 0.0, 1.0);
}
