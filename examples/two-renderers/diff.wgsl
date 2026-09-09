// The third panel. Amplification is a uniform, so dragging the control changes
// one number and redraws this pass alone — the scene is never rendered again.
@group(0) @binding(0) var golden: texture_2d<f32>;
@group(0) @binding(1) var mine: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> amplify: f32;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Nearest sampling on purpose: this pass exists to show single-step
  // differences, and interpolating between texels would invent values that
  // neither renderer produced.
  let a = textureSampleLevel(golden, samp, uv, 0.0).rgb;
  let b = textureSampleLevel(mine, samp, uv, 0.0).rgb;
  let delta = abs(a - b);
  let peak = max(delta.r, max(delta.g, delta.b));

  // A hot ramp, so a one-step difference at high gain still reads as a mark and
  // not as a barely-lit grey.
  let t = clamp(peak * amplify, 0.0, 1.0);
  let col = vec3f(t, t * t * 0.55, t * t * t * 0.25);
  return vec4f(col, 1.0);
}
