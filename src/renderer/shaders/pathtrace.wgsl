struct CameraUniforms {
    cameraPos     : vec3<f32>,
    frameCount    : u32,
    cameraTarget  : vec3<f32>,
    fov           : f32,
    canvasSize    : vec2<f32>,
    _pad0         : vec2<f32>,

    sphereCenter  : vec3<f32>,
    sphereRadius  : f32,
    sphereIOR     : f32,
    dispersion    : f32,        // offset 68; absorbs first 4 of 12 implicit-pad bytes
    _pad1         : vec3<f32>,  // offset 80 (align 16)

    lightPos      : vec3<f32>,
    lightRadius   : f32,
    lightColor    : vec3<f32>,
    lightIntensity: f32,

    groundAlbedo  : vec3<f32>,
    absorption    : f32,
}

@group(0) @binding(0) var<uniform> u       : CameraUniforms;
@group(0) @binding(1) var          readTex : texture_2d<f32>;
@group(0) @binding(2) var          writeTex: texture_storage_2d<rgba32float, write>;

// ── PCG hash RNG ─────────────────────────────────────────────────────────────
var<private> rngState: u32;

fn pcgNext() -> u32 {
    rngState = rngState * 747796405u + 2891336453u;
    let w = ((rngState >> ((rngState >> 28u) + 4u)) ^ rngState) * 277803737u;
    return (w >> 22u) ^ w;
}

fn rand() -> f32 {
    return f32(pcgNext()) / f32(0xffffffffu);
}

fn rand2() -> vec2<f32> { return vec2<f32>(rand(), rand()); }
fn rand3() -> vec3<f32> { return vec3<f32>(rand(), rand(), rand()); }

// ── Geometry helpers ──────────────────────────────────────────────────────────
struct Ray { origin: vec3<f32>, dir: vec3<f32> }

struct HitRecord {
    t        : f32,
    pos      : vec3<f32>,
    normal   : vec3<f32>,
    frontFace: bool,
    matID    : u32,   // 0=ground, 1=glass, 2=light
}

fn noHit() -> HitRecord {
    var h: HitRecord;
    h.t = 1e30;
    return h;
}

fn setFaceNormal(h: ptr<function, HitRecord>, ray: Ray, outwardN: vec3<f32>) {
    (*h).frontFace = dot(ray.dir, outwardN) < 0.0;
    (*h).normal = select(-outwardN, outwardN, (*h).frontFace);
}

// Ground plane y=0
fn hitPlane(ray: Ray) -> HitRecord {
    var h = noHit();
    let denom = ray.dir.y;
    if abs(denom) < 1e-6 { return h; }
    let t = -ray.origin.y / denom;
    if t < 0.001 { return h; }
    h.t = t;
    h.pos = ray.origin + t * ray.dir;
    let n = vec3<f32>(0.0, 1.0, 0.0);
    setFaceNormal(&h, ray, n);
    h.matID = 0u;
    return h;
}

// Sphere
fn hitSphere(ray: Ray, center: vec3<f32>, radius: f32, matID: u32) -> HitRecord {
    var h = noHit();
    let oc = ray.origin - center;
    let a  = dot(ray.dir, ray.dir);
    let hb = dot(oc, ray.dir);
    let c  = dot(oc, oc) - radius * radius;
    let disc = hb * hb - a * c;
    if disc < 0.0 { return h; }
    let sqrtD = sqrt(disc);
    var t = (-hb - sqrtD) / a;
    if t < 0.001 { t = (-hb + sqrtD) / a; }
    if t < 0.001 { return h; }
    h.t   = t;
    h.pos = ray.origin + t * ray.dir;
    let outN = (h.pos - center) / radius;
    setFaceNormal(&h, ray, outN);
    h.matID = matID;
    return h;
}

fn closerHit(a: HitRecord, b: HitRecord) -> HitRecord {
    if b.t < a.t { return b; }
    return a;
}

// ── Sampling ──────────────────────────────────────────────────────────────────
fn cosineSampleHemisphere(n: vec3<f32>) -> vec3<f32> {
    let r = rand2();
    let phi = 6.2831853 * r.x;
    let cosTheta = sqrt(r.y);
    let sinTheta = sqrt(1.0 - r.y);
    let tangent = normalize(select(
        cross(n, vec3<f32>(1.0, 0.0, 0.0)),
        cross(n, vec3<f32>(0.0, 1.0, 0.0)),
        abs(n.x) > 0.9
    ));
    let bitangent = cross(n, tangent);
    return sinTheta * cos(phi) * tangent
         + sinTheta * sin(phi) * bitangent
         + cosTheta * n;
}

fn uniformDiskSample(r: f32) -> vec2<f32> {
    let u = rand2();
    let angle = 6.2831853 * u.x;
    let radius = r * sqrt(u.y);
    return vec2<f32>(cos(angle), sin(angle)) * radius;
}

// ── Schlick Fresnel ───────────────────────────────────────────────────────────
fn schlick(cosTheta: f32, ior: f32) -> f32 {
    var r0 = (1.0 - ior) / (1.0 + ior);
    r0 = r0 * r0;
    return r0 + (1.0 - r0) * pow(1.0 - cosTheta, 5.0);
}

// ── Path trace ────────────────────────────────────────────────────────────────
fn tracePath(primaryRay: Ray, ior: f32) -> vec3<f32> {
    var ray = primaryRay;
    var throughput = vec3<f32>(1.0);
    var color      = vec3<f32>(0.0);

    for (var bounce = 0; bounce < 8; bounce++) {

        // Scene intersection
        var hit = noHit();
        hit = closerHit(hit, hitPlane(ray));
        hit = closerHit(hit, hitSphere(ray, u.sphereCenter, u.sphereRadius, 1u));

        // Skip the light sphere on the primary ray — it is invisible to the camera
        // but still terminates secondary paths (bounces), creating caustics.
        if bounce > 0 {
            let lightDisk = hitSphere(ray, u.lightPos, u.lightRadius, 2u);
            hit = closerHit(hit, lightDisk);
        }

        if hit.t >= 1e29 {
            // Sky / miss — dark sky
            color += throughput * vec3<f32>(0.05, 0.07, 0.1);
            break;
        }

        // Light hit
        if hit.matID == 2u {
            color += throughput * u.lightColor * u.lightIntensity;
            break;
        }

        // Ground (Lambertian)
        if hit.matID == 0u {
            let newDir = cosineSampleHemisphere(hit.normal);
            ray = Ray(hit.pos + hit.normal * 0.001, newDir);
            throughput *= u.groundAlbedo;
        }

        // Glass
        if hit.matID == 1u {
            // eta = ratio ni/nt; ior parameter carries per-channel IOR for dispersion
            let eta = select(ior, 1.0 / ior, hit.frontFace);
            let cosI = min(dot(-ray.dir, hit.normal), 1.0);
            let sinT2 = eta * eta * (1.0 - cosI * cosI);

            // Beer-Lambert attenuation for path length inside the glass
            if !hit.frontFace {
                throughput *= exp(-u.absorption * hit.t * vec3<f32>(1.0));
            }

            let reflected = reflect(ray.dir, hit.normal);
            if sinT2 > 1.0 {
                // Total internal reflection
                ray = Ray(hit.pos + hit.normal * 0.0001, reflected);
            } else {
                let fresnel = schlick(cosI, eta);
                if rand() < fresnel {
                    ray = Ray(hit.pos + hit.normal * 0.0001, reflected);
                } else {
                    let refracted = refract(ray.dir, hit.normal, eta);
                    ray = Ray(hit.pos - hit.normal * 0.0001, refracted);
                }
            }
        }

        // Russian roulette after 3 bounces
        if bounce >= 3 {
            let p = max(throughput.r, max(throughput.g, throughput.b));
            if rand() > p { break; }
            throughput /= p;
        }
    }

    return color;
}

// ── Entry point ───────────────────────────────────────────────────────────────
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let px = vec2<i32>(i32(gid.x), i32(gid.y));
    let sz = vec2<i32>(i32(u.canvasSize.x), i32(u.canvasSize.y));
    if px.x >= sz.x || px.y >= sz.y { return; }

    // Seed RNG from pixel + frame
    rngState = (gid.x * 1973u + gid.y * 9277u + u.frameCount * 26699u) | 1u;

    // Sub-pixel jitter
    let jitter = rand2() - 0.5;
    let uv = (vec2<f32>(px) + jitter) / vec2<f32>(sz);

    // Build camera basis
    let up    = vec3<f32>(0.0, 1.0, 0.0);
    let fwd   = normalize(u.cameraTarget - u.cameraPos);
    let right = normalize(cross(fwd, up));
    let camUp = cross(right, fwd);

    let aspect    = u.canvasSize.x / u.canvasSize.y;
    let halfH     = tan(radians(u.fov * 0.5));
    let halfW     = halfH * aspect;

    // NDC [-1,1] (flip y so +y is up in world)
    let ndc = vec2<f32>((uv.x * 2.0 - 1.0) * halfW,
                        (1.0 - uv.y * 2.0) * halfH);

    let rayDir = normalize(fwd + ndc.x * right + ndc.y * camUp);
    let ray    = Ray(u.cameraPos, rayDir);

    // Per-channel IOR for chromatic dispersion (R bends less, B bends more)
    let iorR = u.sphereIOR - u.dispersion;
    let iorG = u.sphereIOR;
    let iorB = u.sphereIOR + u.dispersion;

    // Reseed independently per channel so each path is uncorrelated
    rngState = (gid.x * 1973u + gid.y * 9277u + u.frameCount * 26699u) | 1u;
    let r = tracePath(ray, iorR).r;

    rngState = (gid.x * 1973u + gid.y * 9277u + u.frameCount * 26699u + 1u) | 1u;
    let g = tracePath(ray, iorG).g;

    rngState = (gid.x * 1973u + gid.y * 9277u + u.frameCount * 26699u + 2u) | 1u;
    let b = tracePath(ray, iorB).b;

    let newSample = vec3<f32>(r, g, b);

    // Temporal accumulation
    let prev = textureLoad(readTex, px, 0).rgb;
    let fc   = f32(u.frameCount);
    let blended = (prev * fc + newSample) / (fc + 1.0);

    textureStore(writeTex, px, vec4<f32>(blended, 1.0));
}
