// --- Synthesizer Sound Engine (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgmOsc = null;
let bgmGain = null;
let isAudioInitialized = false;

function initAudio() {
    if (isAudioInitialized) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    isAudioInitialized = true;
}

function playTone(freq, type, duration, vol=0.1, slideFreq=null) {
    if(!isAudioInitialized) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if(slideFreq) {
        osc.frequency.exponentialRampToValueAtTime(slideFreq, audioCtx.currentTime + duration);
    }
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playCoinSound() { playTone(1200, 'sine', 0.1, 0.1, 2000); setTimeout(()=>playTone(1600, 'sine', 0.2, 0.1, 2400), 50); }
function playJumpSound() { playTone(300, 'square', 0.3, 0.05, 600); }
function playDuckSound() { playTone(400, 'triangle', 0.3, 0.05, 200); }
function playCrashSound() { 
    playTone(150, 'sawtooth', 0.5, 0.2, 40); 
    playTone(100, 'square', 0.4, 0.2, 30);
    // Noise simulation
    const bufferSize = audioCtx.sampleRate * 0.5;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    noise.connect(gain); gain.connect(audioCtx.destination);
    noise.start(); noise.stop(audioCtx.currentTime + 0.5);
}

function startBGM() {
    if(!isAudioInitialized) return;
    if(bgmOsc) stopBGM();
    bgmOsc = audioCtx.createOscillator();
    bgmGain = audioCtx.createGain();
    bgmOsc.type = 'triangle';
    bgmGain.gain.value = 0.05;
    bgmOsc.connect(bgmGain);
    bgmGain.connect(audioCtx.destination);
    bgmOsc.start();
    
    // Simple bouncy bass loop
    const notes = [220, 220, 330, 261.63, 293.66, 220, 196, 220];
    let i = 0;
    setInterval(() => {
        if(isPlaying && isAudioInitialized && bgmOsc) {
            bgmOsc.frequency.setValueAtTime(notes[i%notes.length]/2, audioCtx.currentTime);
            bgmGain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            bgmGain.gain.exponentialRampToValueAtTime(0.02, audioCtx.currentTime + 0.2);
            i++;
        }
    }, 250);
}

function stopBGM() {
    if(bgmOsc) { bgmOsc.stop(); bgmOsc.disconnect(); bgmOsc = null; }
    if(bgmGain) { bgmGain.disconnect(); bgmGain = null; }
}


// --- Game State Vars ---
let isPlaying = false;
let score = 0;
let coins = 0;
let speed = 25; 
let objects = []; 
let buildings = [];

const LANE_WIDTH = 2.8;

// Player logic
let currentLane = 0; 
let targetX = 0;
let vy = 0;
let gravity = -60; 
let isJumping = false;
let isDucking = false;

// --- Setup Three.js Scene ---
const canvas = document.getElementById('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x75d1ff); 
scene.fog = new THREE.FogExp2(0x75d1ff, 0.015);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 150);
camera.position.set(0, 5, 8);
camera.lookAt(0, 1.5, 0);

// --- Lights ---
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x555555, 0.8);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.0);
dirLight.position.set(20, 40, 15);
dirLight.castShadow = true;
dirLight.shadow.camera.left = -20;
dirLight.shadow.camera.right = 20;
dirLight.shadow.camera.top = 20;
dirLight.shadow.camera.bottom = -20;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// --- High Quality Environment ---
const trackCanvas = document.createElement('canvas');
trackCanvas.width = 1024; trackCanvas.height = 1024;
const ctx = trackCanvas.getContext('2d');
// Gravel/Ballast base
ctx.fillStyle = '#6e5f52'; ctx.fillRect(0,0,1024,1024);
for(let i=0; i<5000; i++) {
    ctx.fillStyle = Math.random()>0.5 ? '#54463a' : '#8c7b6c';
    ctx.fillRect(Math.random()*1024, Math.random()*1024, 4, 4);
}
// Wooden ties
ctx.fillStyle = '#302113';
for(let i=0; i<1024; i+=80) {
    ctx.fillRect(80, i, 200, 24);
    ctx.fillRect(412, i, 200, 24);
    ctx.fillRect(744, i, 200, 24);
}
// Metal Rails with shine
const drawRails = (cx) => {
    ctx.fillStyle = '#9aa8b5'; ctx.fillRect(cx - 65, 0, 18, 1024);
    ctx.fillStyle = '#cad6e0'; ctx.fillRect(cx - 62, 0, 8, 1024); // highlight
    ctx.fillStyle = '#9aa8b5'; ctx.fillRect(cx + 47, 0, 18, 1024);
    ctx.fillStyle = '#cad6e0'; ctx.fillRect(cx + 50, 0, 8, 1024); // highlight
};
drawRails(180); drawRails(512); drawRails(844);

const groundTex = new THREE.CanvasTexture(trackCanvas);
groundTex.wrapS = THREE.RepeatWrapping; groundTex.wrapT = THREE.RepeatWrapping;
groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
groundTex.repeat.set(1.5, 60);

const groundGeo = new THREE.PlaneGeometry(30, 300);
const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9, metalness: 0.1 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- Highly Detailed Player Character ---
const playerGroup = new THREE.Group();
scene.add(playerGroup);

// Internal hit box for collisions
const hitGeo = new THREE.BoxGeometry(0.8, 2.8, 0.8); 
const hitMat = new THREE.MeshBasicMaterial({visible: false});
const hitMesh = new THREE.Mesh(hitGeo, hitMat);
hitMesh.position.y = 1.4;
playerGroup.add(hitMesh);

// Torso
const bGeo = new THREE.BoxGeometry(0.9, 1.1, 0.6);
const bMat = new THREE.MeshStandardMaterial({color: 0xee2233, roughness: 0.7}); 
const bodyMesh = new THREE.Mesh(bGeo, bMat);
bodyMesh.position.y = 1.35; bodyMesh.castShadow = true;
playerGroup.add(bodyMesh);

// Backpack
const bpGeo = new THREE.BoxGeometry(0.7, 0.9, 0.4);
const bpMat = new THREE.MeshStandardMaterial({color: 0x2266cc, roughness: 0.8});
const backpack = new THREE.Mesh(bpGeo, bpMat);
backpack.position.set(0, 1.4, -0.4); backpack.castShadow = true;
playerGroup.add(backpack);

// Head & Face
const hGeo = new THREE.BoxGeometry(0.75, 0.75, 0.75);
const hMat = new THREE.MeshStandardMaterial({color: 0xffccaa, roughness: 0.5}); 
const headGroup = new THREE.Group();
headGroup.position.set(0, 2.3, 0);
playerGroup.add(headGroup);

const headMesh = new THREE.Mesh(hGeo, hMat);
headMesh.castShadow = true;
headGroup.add(headMesh);

// Eyes
const eyeGeo = new THREE.BoxGeometry(0.15, 0.15, 0.1);
const eyeMat = new THREE.MeshBasicMaterial({color: 0x111111});
const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.18, 0.1, 0.4);
const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.18, 0.1, 0.4);
headGroup.add(eyeL, eyeR);

// Cap
const cGeo = new THREE.BoxGeometry(0.8, 0.25, 0.85);
const cMat = new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.9});
const capMesh = new THREE.Mesh(cGeo, cMat);
capMesh.position.set(0, 0.45, 0.1); capMesh.castShadow = true;
const capBill = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.5), cMat);
capBill.position.set(0, 0.35, 0.6); capBill.castShadow = true;
headGroup.add(capMesh, capBill);

// Arms
const armGeo = new THREE.BoxGeometry(0.3, 0.9, 0.3);
const armMat = new THREE.MeshStandardMaterial({color: 0xffccaa, roughness: 0.5});
const armL = new THREE.Mesh(armGeo, armMat);
armL.position.set(-0.65, 1.4, 0); armL.castShadow = true;
const armR = new THREE.Mesh(armGeo, armMat);
armR.position.set(0.65, 1.4, 0); armR.castShadow = true;
playerGroup.add(armL, armR);

// Legs (Jeans)
const lGeo = new THREE.BoxGeometry(0.4, 0.9, 0.45);
const lMat = new THREE.MeshStandardMaterial({color: 0x3355aa, roughness: 0.9}); 
const legLeft = new THREE.Mesh(lGeo, lMat);
legLeft.position.set(-0.25, 0.45, 0); legLeft.castShadow = true;
const legRight = new THREE.Mesh(lGeo, lMat);
legRight.position.set(0.25, 0.45, 0); legRight.castShadow = true;

// Shoes
const shoeGeo = new THREE.BoxGeometry(0.45, 0.2, 0.6);
const shoeMat = new THREE.MeshStandardMaterial({color: 0xdddddd});
const shoeL = new THREE.Mesh(shoeGeo, shoeMat); shoeL.position.set(0, -0.4, 0.1);
const shoeR = new THREE.Mesh(shoeGeo, shoeMat); shoeR.position.set(0, -0.4, 0.1);
legLeft.add(shoeL); legRight.add(shoeR);
playerGroup.add(legLeft, legRight);

// Hoverboard with Jet
const hbGroup = new THREE.Group();
hbGroup.position.set(0, 0.08, 0);
playerGroup.add(hbGroup);

const hbGeo = new THREE.BoxGeometry(1.4, 0.15, 3.0);
const hbMat = new THREE.MeshStandardMaterial({color: 0x00e5ff, metalness: 0.8, roughness: 0.2});
const hoverboard = new THREE.Mesh(hbGeo, hbMat);
hoverboard.castShadow = true;
hbGroup.add(hoverboard);

const hbStripe1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 2.8), new THREE.MeshBasicMaterial({color: 0xffffff}));
hbGroup.add(hbStripe1);

// --- Detailed Objects & Trains ---
const barrierGeo = new THREE.BoxGeometry(2.4, 1.4, 0.5);
const highBarrierGeo = new THREE.BoxGeometry(2.4, 0.4, 0.5);
const barrierMat = new THREE.MeshStandardMaterial({color: 0xff6600, roughness: 0.4, metalness: 0.5});
const barrierWhite = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.4});

function createDetailedBarrier(isHigh) {
    const group = new THREE.Group();
    const main = new THREE.Mesh(isHigh ? highBarrierGeo : barrierGeo, barrierMat);
    main.castShadow = true; group.add(main);
    // Stripes
    for(let i=-0.8; i<=0.8; i+=0.8) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, isHigh? 0.41 : 1.41, 0.51), barrierWhite);
        stripe.position.x = i; group.add(stripe);
    }
    return group;
}

const trainGeo = new THREE.BoxGeometry(2.6, 4.0, 14);

function createPBRTrainTexture(baseColor, stripeColor) {
    const tCanvas = document.createElement('canvas');
    tCanvas.width = 1024; tCanvas.height = 1024;
    const tCtx = tCanvas.getContext('2d');
    
    // Base metal
    tCtx.fillStyle = baseColor; tCtx.fillRect(0,0,1024,1024);
    
    // Panel lines
    tCtx.fillStyle = 'rgba(0,0,0,0.5)';
    for(let i=0; i<1024; i+=128) tCtx.fillRect(i, 0, 4, 1024);
    
    // Windows
    tCtx.fillStyle = '#111115';
    for(let i=50; i<900; i+=200) {
        tCtx.fillRect(i, 200, 150, 250);
        // Window reflection
        tCtx.fillStyle = 'rgba(255,255,255,0.1)';
        tCtx.beginPath(); tCtx.moveTo(i, 200); tCtx.lineTo(i+150, 450); tCtx.lineTo(i+150, 200); tCtx.fill();
        tCtx.fillStyle = '#111115'; // reset
    }
    
    // Stripes
    tCtx.fillStyle = stripeColor;
    tCtx.fillRect(0, 500, 1024, 80);
    tCtx.fillStyle = '#ffffff';
    tCtx.fillRect(0, 580, 1024, 20);

    // Graffiti text for realism
    tCtx.font = 'bold 90px "Titan One", sans-serif';
    tCtx.fillStyle = 'rgba(255, 0, 150, 0.6)';
    tCtx.fillText("SURF", 80, 800);
    tCtx.fillStyle = 'rgba(0, 255, 100, 0.6)';
    tCtx.fillText("WILD", 500, 850);

    const tex = new THREE.CanvasTexture(tCanvas);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return new THREE.MeshStandardMaterial({map: tex, roughness: 0.3, metalness: 0.7});
}

const trainMats = [ 
    createPBRTrainTexture('#1a4f8f', '#ffaa00'), 
    createPBRTrainTexture('#8f1a1a', '#ffffff'), 
    createPBRTrainTexture('#1c733a', '#ffeb00') 
];

function createDetailedTrain(mat) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(trainGeo, mat);
    body.position.y = 2.0; body.castShadow = true; body.receiveShadow = true;
    group.add(body);
    
    // Headlights
    const lightMat = new THREE.MeshBasicMaterial({color: 0xffffe0});
    const l1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1), lightMat);
    l1.rotation.x = Math.PI/2; l1.position.set(-0.8, 1.0, 7.01);
    const l2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1), lightMat);
    l2.rotation.x = Math.PI/2; l2.position.set(0.8, 1.0, 7.01);
    group.add(l1, l2);

    // Front Window
    const winGeo = new THREE.PlaneGeometry(2.2, 1.2);
    const winMat = new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.1, metalness: 0.9});
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(0, 2.8, 7.02);
    group.add(win);
    
    // Wheels simple representation
    const wheelMat = new THREE.MeshStandardMaterial({color: 0x222222});
    for(let z=-5; z<=5; z+=10) {
        for(let x=-1.1; x<=1.1; x+=2.2) {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2), wheelMat);
            w.rotation.z = Math.PI/2; w.position.set(x, 0.4, z);
            group.add(w);
        }
    }
    return group;
}

const coinGeo = new THREE.TorusGeometry(0.35, 0.1, 8, 20);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0, roughness: 0.2, emissive: 0x443300 });

function spawnObject() {
    const lane = [ -1, 0, 1 ][Math.floor(Math.random()*3)];
    const x = lane * LANE_WIDTH;
    const z = -120; // Spawn further away for HD view
    
    let type = Math.random();
    
    if(type < 0.3) {
        // Train
        const trainGroup = createDetailedTrain(trainMats[Math.floor(Math.random()*3)]);
        trainGroup.position.set(x, 0, z);
        scene.add(trainGroup);
        // Create hitbox
        const boundingBox = new THREE.Box3();
        objects.push({ mesh: trainGroup, type: 'train', isCoin: false, hit: false, box: boundingBox, yOff: 0 });
    } else if(type < 0.55) {
        // Low Barrier (Jump)
        const barrier = createDetailedBarrier(false);
        barrier.position.set(x, 0.7, z);
        scene.add(barrier);
        objects.push({ mesh: barrier, type: 'barrier', isCoin: false, hit: false, box: new THREE.Box3(), yOff: 0.7 });
        
        // Bonus Coin above it
        if(Math.random() > 0.3) {
            const coin = new THREE.Mesh(coinGeo, coinMat);
            coin.position.set(x, 2.8, z);
            coin.castShadow = true;
            scene.add(coin);
            objects.push({ mesh: coin, type: 'coin', isCoin: true, hit: false, box: new THREE.Box3(), yOff: 2.8 });
        }
    } else if(type < 0.75) {
        // High Barrier (Duck)
        const barrier = createDetailedBarrier(true);
        barrier.position.set(x, 2.0, z);
        scene.add(barrier);
        
        const standMat = new THREE.MeshStandardMaterial({color: 0x555555, metalness: 0.8});
        const standGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.0);
        const s1 = new THREE.Mesh(standGeo, standMat); s1.position.set(x - 1.1, 1.0, z); s1.castShadow=true; scene.add(s1);
        const s2 = new THREE.Mesh(standGeo, standMat); s2.position.set(x + 1.1, 1.0, z); s2.castShadow=true; scene.add(s2);

        objects.push({ 
            mesh: barrier, type: 'high_barrier', isCoin: false, hit: false, box: new THREE.Box3(), yOff: 2.0,
            extras: [s1, s2] 
        });
    } else {
        // Coins sequence
        for(let i=0; i<5; i++) {
            const coin = new THREE.Mesh(coinGeo, coinMat);
            const yOff = (Math.sin((i/4)*Math.PI) * 1.5) + 0.6; 
            coin.position.set(x, yOff, z - (i * 1.8));
            coin.castShadow = true;
            scene.add(coin);
            objects.push({ mesh: coin, type: 'coin', isCoin: true, hit: false, box: new THREE.Box3(), yOff: yOff });
        }
    }
}

// --- HD Scenery Buildings ---
function createBuilding(x, z) {
    const w = 6 + Math.random()*4;
    const h = 15 + Math.random()*30;
    const d = 5 + Math.random()*5;
    const geo = new THREE.BoxGeometry(w, h, d);
    
    // Procedural Windows texture
    const bCanvas = document.createElement('canvas');
    bCanvas.width = 128; bCanvas.height = 256;
    const bCtx = bCanvas.getContext('2d');
    const bColor = ['#334455', '#554433', '#445566', '#2a2a2a'][Math.floor(Math.random()*4)];
    bCtx.fillStyle = bColor; bCtx.fillRect(0,0,128,256);
    bCtx.fillStyle = '#112233'; // Windows
    for(let i=10; i<128; i+=30) {
        for(let j=20; j<256; j+=40) {
            bCtx.fillStyle = Math.random()>0.2 ? '#112233' : '#ffea00'; // light on/off
            bCtx.fillRect(i, j, 20, 30);
        }
    }
    const tex = new THREE.CanvasTexture(bCanvas);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(w/10, h/10);

    const mat = new THREE.MeshStandardMaterial({map: tex, roughness: 0.8, metalness: 0.2});
    const b = new THREE.Mesh(geo, mat);
    b.position.set(x, h/2, z);
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b);
    return b;
}

for(let i=0; i<20; i++) {
    buildings.push(createBuilding(-15 - Math.random()*8, -i*15 + 20));
    buildings.push(createBuilding(15 + Math.random()*8, -i*15 + 20));
}

// --- Dynamic Particle System (Hoverboard Jets) ---
const particles = [];
const pGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
const pMat = new THREE.MeshBasicMaterial({color: 0x00e5ff});
function emitParticle(x, y, z) {
    if(particles.length > 50) return;
    const p = new THREE.Mesh(pGeo, pMat);
    p.position.set(x + (Math.random()-0.5)*0.3, y, z + 1.5);
    scene.add(p);
    particles.push({ mesh: p, life: 1.0, vx: (Math.random()-0.5)*0.05, vy: -0.05, vz: Math.random()*0.1 });
}

// --- Core Game Loop ---
const clock = new THREE.Clock();
const hitBox = new THREE.Box3();
let runTime = 0;
let objTimer = 0;

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1); 
    
    if(isPlaying) {
        speed += dt * 0.15; 
        score += speed * dt * 0.5; 
        document.getElementById('score').innerText = Math.floor(score);
        document.getElementById('coins').innerText = coins;
        
        groundTex.offset.y -= speed * 0.05 * dt;

        // Player animations
        playerGroup.position.x += (targetX - playerGroup.position.x) * 12 * dt;
        
        vy += gravity * dt;
        playerGroup.position.y += vy * dt;
        
        if(playerGroup.position.y <= 0) {
            playerGroup.position.y = 0;
            vy = 0;
            isJumping = false;
        }

        let targetScaleY = isDucking ? 0.45 : 1.0;
        playerGroup.scale.y += (targetScaleY - playerGroup.scale.y) * 15 * dt;

        if(!isJumping) {
            runTime += speed * dt * 0.6;
            // Running / Boarding Animation
            armL.rotation.x = Math.sin(runTime) * 1.2;
            armR.rotation.x = -Math.sin(runTime) * 1.2;
            legLeft.rotation.x = Math.sin(runTime) * 1.0;
            legRight.rotation.x = -Math.sin(runTime) * 1.0;
            
            // Leaning on turn
            playerGroup.rotation.z = -(targetX - playerGroup.position.x) * 0.15;
            playerGroup.rotation.y = -(targetX - playerGroup.position.x) * 0.1;
            
            hbGroup.position.y = 0.08 + Math.abs(Math.sin(runTime*2)) * 0.05;
            hbGroup.rotation.x = 0;
            headGroup.rotation.y = 0;
            
            // Emit particles
            emitParticle(playerGroup.position.x, playerGroup.position.y + 0.1, playerGroup.position.z);
        } else {
            armL.rotation.x = Math.PI; armR.rotation.x = Math.PI; // hands up
            legLeft.rotation.x = -0.5; legRight.rotation.x = -0.5;
            hbGroup.rotation.x += 18 * dt; // Kickflip trick
            playerGroup.rotation.z = 0; 
            headGroup.rotation.y = Math.sin(Date.now()*0.01) * 0.2; // look around
        }

        // Particle update
        for(let i = particles.length-1; i>=0; i--) {
            let p = particles[i];
            p.mesh.position.x += p.vx; p.mesh.position.y += p.vy; p.mesh.position.z += speed*dt + p.vz;
            p.life -= dt * 2.5;
            p.mesh.scale.setScalar(p.life);
            if(p.life <= 0) { scene.remove(p.mesh); particles.splice(i,1); }
        }

        // Move Buildings
        buildings.forEach(b => {
            b.position.z += speed * dt;
            if(b.position.z > 30) {
                b.position.z -= 250; 
                b.scale.y = 0.5 + Math.random()*1.5; 
            }
        });

        // Spawn & Move Objects
        objTimer -= dt;
        if(objTimer <= 0) {
            spawnObject();
            objTimer = Math.max(0.5, 1.8 - (speed * 0.025)); 
        }

        // Collision Check setup
        hitMesh.updateWorldMatrix(true, false);
        hitBox.setFromObject(hitMesh);
        // Shrink hitbox slightly for fairer gameplay
        hitBox.expandByScalar(-0.1);

        for (let i = objects.length - 1; i >= 0; i--) {
            const obj = objects[i];

            if(obj.type === 'train') {
                // Trains move towards player slightly faster than speed
                obj.mesh.position.z += (speed + 15) * dt; 
            } else {
                obj.mesh.position.z += speed * dt;
            }
            if(obj.extras) obj.extras.forEach(e => { e.position.z += speed*dt; });

            if (obj.isCoin) {
                obj.mesh.rotation.y += 4 * dt; 
                // Hover effect
                obj.mesh.position.y = obj.yOff + Math.sin(Date.now() * 0.005 + i) * 0.2;
                
                if(!obj.hit) {
                    obj.box.setFromObject(obj.mesh);
                    if(hitBox.intersectsBox(obj.box)) {
                        obj.hit = true;
                        obj.mesh.visible = false;
                        coins++;
                        playCoinSound();
                    }
                }
            } else if (!obj.hit) {
                obj.box.setFromObject(obj.mesh);
                // Obstacle Hit detection
                if (hitBox.intersectsBox(obj.box)) {
                    obj.hit = true;
                    gameOver();
                }
            }

            if (obj.mesh.position.z > 15) { 
                scene.remove(obj.mesh);
                if(obj.extras) obj.extras.forEach(e => scene.remove(e));
                objects.splice(i, 1);
            }
        }
    }
    
    renderer.render(scene, camera);
}

// --- Input & Controls ---
function move(dir) {
    currentLane += dir;
    if (currentLane > 1) currentLane = 1;
    if (currentLane < -1) currentLane = -1;
    targetX = currentLane * LANE_WIDTH;
}

function jump() {
    if (!isJumping && !isDucking) {
        vy = 22; 
        isJumping = true;
        playJumpSound();
    }
}

function duck() {
    if (!isJumping && !isDucking) {
        isDucking = true;
        vy = -30; // slam down hard
        playDuckSound();
        setTimeout(() => isDucking = false, 700);
    }
}

window.addEventListener('keydown', e => {
    if(!isPlaying) return;
    if(e.code === 'ArrowLeft' || e.code === 'KeyA') move(-1);
    if(e.code === 'ArrowRight' || e.code === 'KeyD') move(1);
    if(e.code === 'ArrowUp' || e.code === 'KeyW') jump();
    if(e.code === 'ArrowDown' || e.code === 'KeyS') duck();
});

let startX=0, startY=0;
window.addEventListener('touchstart', e => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; });
window.addEventListener('touchend', e => {
    if(!isPlaying) return;
    let dx = e.changedTouches[0].clientX - startX;
    let dy = e.changedTouches[0].clientY - startY;
    
    if(Math.abs(dx) > Math.abs(dy)) {
        if(dx > 30) move(1);
        else if(dx < -30) move(-1);
    } else {
        if(dy > 30) duck();
        else if(dy < -30) jump();
    }
});

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

// --- Game Flow ---
function gameOver() {
    isPlaying = false;
    stopBGM();
    playCrashSound();
    document.getElementById('final-score').innerText = Math.floor(score);
    document.getElementById('final-coins').innerText = coins;
    document.getElementById('game-over-screen').classList.add('active');
    
    // Death bump effect
    vy = 15;
    playerGroup.rotation.z = Math.PI / 2; // fall over
}

function startGame() {
    initAudio();
    
    score = 0; coins = 0; speed = 30; 
    currentLane = 0; targetX = 0;
    playerGroup.position.x = 0;
    playerGroup.position.y = 0;
    playerGroup.rotation.z = 0;
    vy = 0; isJumping = false; isDucking = false;
    
    objects.forEach(o => {
        scene.remove(o.mesh);
        if(o.extras) o.extras.forEach(e => scene.remove(e));
    });
    objects = [];
    
    document.getElementById('start-screen').classList.remove('active');
    document.getElementById('game-over-screen').classList.remove('active');
    
    isPlaying = true;
    startBGM();
    clock.start();
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

// Start render loop
animate();
