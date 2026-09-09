// A draining soap film.
//
// Two decisions here are load-bearing and both came out of measurement:
//
//  - The colour is integrated across each channel's band instead of sampled at
//    a single wavelength. A real film desaturates as it thickens because the
//    spectrum averages out; three delta wavelengths stay neon at every order.
//  - There are no uniforms and no varyings. `uv` comes from
//    @builtin(position) divided by a constant, so the browser and Node compile
//    the same text and cannot disagree about anything but the arithmetic.
const RES: f32 = 512.0;
const PI: f32 = 3.14159265358979;
const IOR: f32 = 1.34;            // soap film
const TERRACE: f32 = 95.0;        // nm per step
const TERRACE_MIX: f32 = 0.55;

fn fringe(d: f32, cos_t: f32, lambda: f32) -> f32 {
  return 0.5 + 0.5 * cos(4.0 * PI * IOR * d * cos_t / lambda);
}

/** One channel, integrated over its band. */
fn band(d: f32, cos_t: f32, lambda: f32, spread: f32) -> f32 {
  var s = 0.0;
  for (var k = -2; k <= 2; k = k + 1) {
    s += fringe(d, cos_t, lambda + f32(k) * spread);
  }
  return s * 0.2;
}

fn hash(p: vec2f) -> f32 {
  var q = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), w.x),
             mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), w.x), w.y);
}

fn fbm(p: vec2f) -> f32 {
  var q = p;
  var v = 0.0;
  var a = 0.5;
  for (var i = 0; i < 5; i = i + 1) {
    v += a * vnoise(q);
    q = q * 2.03 + vec2f(17.0, 9.0);
    a *= 0.5;
  }
  return v;
}

@fragment fn fs_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let uv = (frag.xy / RES) * 2.0 - 1.0;
  let r = length(uv);
  let cos_t = sqrt(max(1.0 - r * r * 0.93, 0.0));

  // Thickness drains downward: thin at the crown, thick at the foot.
  let drain = smoothstep(-0.95, 0.85, uv.y);
  var d = mix(880.0, 210.0, drain);
  d += 190.0 * (fbm(uv * 1.7 + vec2f(0.0, drain * 1.4)) - 0.5);
  d += 70.0 * sin(uv.x * 6.3 + uv.y * 4.1);
  d = max(d, 40.0);

  // Quantised terraces: what a draining film actually does.
  let stepped = floor(d / TERRACE) * TERRACE + TERRACE * 0.5;
  d = mix(d, stepped, TERRACE_MIX);

  var col = vec3f(band(d, cos_t, 602.0, 17.0),
                  band(d, cos_t, 543.0, 15.0),
                  band(d, cos_t, 464.0, 13.0));

  // A film reflects little face-on and a lot at grazing: that is what makes the
  // rim burn and the middle stay dark.
  let fres = 0.05 + 0.95 * pow(1.0 - cos_t, 3.2);
  col *= mix(0.10, 1.0, fres) * 1.75;
  col += vec3f(1.0, 0.98, 0.95)
       * pow(max(1.0 - length(uv - vec2f(-0.30, 0.34)) * 0.70, 0.0), 8.0) * 0.30;
  col *= smoothstep(1.0, 0.962, r);
  return vec4f(col, 1.0);
}
