import * as THREE from "three"
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import * as TWEEN from "@tweenjs/tween.js"
import { compress } from "three/examples/jsm/libs/fflate.module.js";
// Constants and global variables
const SCENE = new THREE.Scene();
const CAMERA = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3e15);
const RENDERER = new THREE.WebGLRenderer({ alpha: true });
const CONTROLS = new OrbitControls(CAMERA, RENDERER.domElement);
//const AU = 149.6e6; // Astronomical Unit in km
const SUN_RADIUS = 696340;
const PLANET_SCALE = 4;
const DISTANCE_SCALE = 10;

let compressionAmount = 1;

let planetMeshes = [];
let orbitalSpeed = 1;
let selectedPlanet = null;

// Initialize the scene
function initScene() {
  RENDERER.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(RENDERER.domElement);

  CAMERA.position.set(0, 400, 1e7);
  CONTROLS.maxDistance = 7.5e7;

  addEventListeners();
}

// Fetch planet data from API
async function fetchPlanetPositions() {
  const planetNames = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const planetsData = await Promise.all(planetNames.map(async (planet) => {
    const response = await fetch(`https://api.le-systeme-solaire.net/rest/bodies/${planet}`);
    const data = await response.json();
    return formatPlanetData(data, planet);
  }));

  planetsData.unshift(getSunData());
  return planetsData;
}

// Format planet data
function formatPlanetData(data, planet) {
  return {
    name: planet,
    distance: data.semimajorAxis,
    radius: data.meanRadius,
    orbitalPeriod: data.sideralOrbit,
    rotationPeriod: data.sideralRotation,
    texture: `textures/${planet}.jpg`,
    info: formatPlanetInfo(data, planet),
    orbit: `Orbital Period: ${data.sideralOrbit.toFixed(2)} days`,
    rotation: `Rotation Period: ${data.sideralRotation ? data.sideralRotation.toFixed(2) : 'Unknown'} hours`,
    additional: `Additional information about ${planet}.`,
    image: `planet_info/${planet}info.jpg`
  };
}

// Format planet info
function formatPlanetInfo(data, planet) {
  return `
    Name: ${planet}<br>
    Distance: ${data.semimajorAxis.toFixed(2)} km<br>
    Radius: ${data.meanRadius.toFixed(2)} km<br>
    Orbital Period: ${data.sideralOrbit.toFixed(2)} days<br>
    Rotation Period: ${data.sideralRotation ? data.sideralRotation.toFixed(2) : 'Unknown'} hours<br>
    Atmosphere: ${data.atmosphere ? data.atmosphere : 'None'}<br>
    Moons: ${data.moons ? data.moons.map(moon => moon.moon).join(', ') : 'None'}<br>
    Discovery Date: ${data.discoveryDate ? data.discoveryDate : 'Unknown'}<br>
    Discoverer: ${data.discoveredBy ? data.discoveredBy : 'Unknown'}<br>
    Surface Temperature: ${data.avgTemp ? data.avgTemp : 'Unknown'} K<br>
    Mass: ${data.mass ? data.mass.massValue + ' x 10^' + data.mass.massExponent + ' kg' : 'Unknown'}<br>
    Gravity: ${data.gravity ? data.gravity.toFixed(2) + ' m/s²' : 'Unknown'}<br>
    Type: ${data.bodyType ? data.bodyType : 'Unknown'}
  `;
}

// Get sun data
function getSunData() {
  return {
    name: 'sun',
    distance: 0,
    radius: SUN_RADIUS,
    orbitalPeriod: 0,
    rotationPeriod: 25.38,
    texture: 'textures/sun.jpg',
    info: `
      Name: Sun<br>
      Radius: ${SUN_RADIUS.toLocaleString()} km<br>
      Rotation Period: 25.38 days<br>
      Type: G-type main-sequence star (G2V)<br>
      Surface Temperature: 5778 K<br>
      Mass: 1.989 x 10^30 kg<br>
      Gravity: 274 m/s²
    `,
    orbit: 'N/A',
    rotation: '25.38 days',
    additional: 'The Sun is the star at the center of the Solar System. It is a nearly perfect sphere of hot plasma, with internal convective motion that generates a magnetic field via a dynamo process.',
    image: 'planet_info/suninfo.jpg'
  };
}

function compressSize(input: number): number {
  return Math.pow(input, 1 / compressionAmount) + SUN_RADIUS - Math.pow(SUN_RADIUS, 1 / compressionAmount)
}

// Create solar system
function createSolarSystem(planets) {
  const solarSystemGroup = new THREE.Group();
  SCENE.add(solarSystemGroup);

  const loader = new THREE.TextureLoader();

  planets.forEach((planet, index) => createPlanet(planet, index, solarSystemGroup, loader));
  createStars();
}

// Create individual planet
function createPlanet(planet, index, solarSystemGroup, loader) {
  const adjustedDistance = (planet.distance / 1000 + SUN_RADIUS) * DISTANCE_SCALE;
  const planetRadius = planet.radius * 0.5 * PLANET_SCALE;

  const geometry = new THREE.SphereGeometry(compressSize(planetRadius), 32, 32);
  const texture = loader.load(planet.texture);
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const planetMesh = new THREE.Mesh(geometry, material);

  if (planet.name !== 'sun') {
    createOrbit(adjustedDistance, index, solarSystemGroup, planetMesh);
  }

  solarSystemGroup.add(planetMesh);
  planetMesh.position.x = adjustedDistance;

  planetMesh.userData = {
    ...planet,
    distance: adjustedDistance,
    orbitAngle: 0,
    rotationAngle: 0
  };

  planetMesh.onClick = () => {
    selectedPlanet = planetMesh
    showPlanetInfo(planetMesh)
  }

  planetMeshes.push(planetMesh);
  addPlanetToList(planet, planetMesh);
}

// Create orbit for planet
function createOrbit(distance, index, solarSystemGroup, planetMesh) {
  const orbitColors = [0xaaaaaa, 0xffcc00, 0x3399ff, 0xff6633, 0xffcc99, 0xffcc00, 0x66ccff, 0x3399cc];
  const glowMaterial = new THREE.LineBasicMaterial({
    color: orbitColors[index],
    transparent: true,
    opacity: 0.5,
    linewidth: 2
  });

  const orbitPoints = Array.from({ length: 129 }, (_, i) => {
    const angle = (i / 128) * 2 * Math.PI;
    return new THREE.Vector3(distance * Math.cos(angle), 0, distance * Math.sin(angle));
  });

  const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
  const orbitGlow = new THREE.Line(orbitGeometry, glowMaterial);
  orbitGlow.position.y = -0.1;
  orbitGlow.userData = { planet: planetMesh };
  solarSystemGroup.add(orbitGlow);

  orbitGlow.onClick = () => {
    selectedPlanet = planetMesh;
    showPlanetInfo(planetMesh);
  };
}

// Create stars
function createStars() {
  const starsGeometry = new THREE.BufferGeometry();
  const starCount = 10000;
  const starVertices = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount * 3; i += 3) {
    starVertices[i] = (Math.random() - 0.5) * 1e9;
    starVertices[i + 1] = (Math.random() - 0.5) * 1e9;
    starVertices[i + 2] = (Math.random() - 0.5) * 1e9;
  }

  starsGeometry.setAttribute('position', new THREE.BufferAttribute(starVertices, 3));
  const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1, sizeAttenuation: true });
  const stars = new THREE.Points(starsGeometry, starsMaterial);
  SCENE.add(stars);
}

// Add planet to list in UI
function addPlanetToList(planet, planetMesh) {
  const planetList = document.getElementById('planetList');
  const planetItem = document.createElement('li');
  planetItem.textContent = planet.name.charAt(0).toUpperCase() + planet.name.slice(1);
  planetItem.onclick = () => {
    selectedPlanet = planetMesh;
    showPlanetInfo(planetMesh);
  };
  planetList.appendChild(planetItem);
}

let lastTime = Date.now()
// Animation loop
function animate() {
  requestAnimationFrame(animate);

  const now = Date.now();
  const deltaTime = (now - lastTime) / 1000;
  lastTime = now;

  const timeFactor = deltaTime * orbitalSpeed;

  updatePlanetPositions(timeFactor);
  updateCamera();

  CONTROLS.update();
  RENDERER.render(SCENE, CAMERA);
  //TWEEN.update();
  updateClockAndDate(timeFactor);
}

// Update planet positions
function updatePlanetPositions(timeFactor) {
  planetMeshes.forEach((planetMesh) => {
    const { orbitalPeriod, rotationPeriod, distance } = planetMesh.userData;

    planetMesh.userData.orbitAngle += (2 * Math.PI) / (orbitalPeriod * 60) * timeFactor;
    planetMesh.position.x = Math.cos(planetMesh.userData.orbitAngle) * distance;
    planetMesh.position.z = Math.sin(planetMesh.userData.orbitAngle) * distance;

    planetMesh.userData.rotationAngle += (2 * Math.PI) / (rotationPeriod * 60) * timeFactor;
    planetMesh.rotation.y = planetMesh.userData.rotationAngle;

    if (orbitalPeriod === 0) {
      planetMesh.position.set(0, 0, 0);
    }
  });
}

// Update camera position
function updateCamera() {
  if (selectedPlanet) {
    const targetPosition = new THREE.Vector3(
      selectedPlanet.position.x,
      selectedPlanet.position.y + 400,
      selectedPlanet.position.z + 1.5e6
    );
    CAMERA.position.lerp(targetPosition, 0.1);
    CAMERA.lookAt(selectedPlanet.position);
  }
}

// Update clock and date display
function updateClockAndDate(timeFactor) {
  const now = new Date();
  const adjustedTime = new Date(now.getTime() + timeFactor * 1000);
  document.getElementById('clock').innerText = adjustedTime.toLocaleTimeString();
  document.getElementById('date').innerText = adjustedTime.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

// Show planet info in popup
function showPlanetInfo(planetMesh) {
  const planetInfo = document.getElementById('planetInfo');
  planetInfo.innerHTML = `
    <strong>${planetMesh.userData.name.charAt(0).toUpperCase() + planetMesh.userData.name.slice(1)}</strong><br>
    <img src="${planetMesh.userData.image}" alt="${planetMesh.userData.name}" class="planet-info-image"><br>
    ${planetMesh.userData.info}
  `;
  document.getElementById('popup').style.display = 'block';
}

// Add event listeners
function addEventListeners() {
  window.addEventListener('resize', onWindowResize);

  document.getElementById('toggleOrbits')?.addEventListener('change', toggleOrbits);
  document.getElementById('toggleLabels')?.addEventListener('change', toggleLabels);
  document.getElementById('speedSlider')?.addEventListener('input', updateOrbitalSpeed);
  document.getElementById('compressionSlider')?.addEventListener('input', updateCompressionAmount);
  document.getElementById('close').onclick = closePopup;

  RENDERER.domElement.addEventListener('click', onCanvasClick);
}

// Event handler functions
function onWindowResize() {
  CAMERA.aspect = window.innerWidth / window.innerHeight;
  CAMERA.updateProjectionMatrix();
  RENDERER.setSize(window.innerWidth, window.innerHeight);
}

function toggleOrbits(event: HTMLElementEventMap['input']) {
  SCENE.children[0].children.forEach(child => {
    if (child instanceof THREE.Line) {
      child.visible = event.target.checked;
    }
  });
}

function toggleLabels(event) {
  planetMeshes.forEach(planetMesh => {
    planetMesh.visible = event.target.checked;
  });
}

function updateOrbitalSpeed(event) {
  orbitalSpeed = event.target.value;
  document.getElementById('speedValue').innerText = `${orbitalSpeed}x`;
}

function updateCompressionAmount(event: Event) {
  compressionAmount = parseFloat((event.target as HTMLInputElement).value)
  let compressionAmountLabel = document.getElementById('compressionAmount')
  if (compressionAmountLabel) {
    compressionAmountLabel.innerText = ((compressionAmount - 1) * 1000 + 1).toFixed(1) + 'x';
  }
  planetMeshes.forEach((planetMesh) => {
    let newScale = compressSize(planetMesh.userData.radius) / planetMesh.userData.radius
    planetMesh.scale.set(newScale, newScale, newScale)
  });
}

function closePopup() {
  document.getElementById('popup').style.display = 'none';
  selectedPlanet = null;
}

function onCanvasClick(event) {
  const mouse = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, CAMERA);

  const intersects = raycaster.intersectObjects(planetMeshes);
  if (intersects.length > 0) {
    intersects[0].object.onClick();
  }

  const orbitIntersects = raycaster.intersectObjects(SCENE.children[0].children.filter(child => child instanceof THREE.Line));
  if (orbitIntersects.length > 0) {
    orbitIntersects[0].object.onClick();
  }
}

// Initialize and start the simulation
async function init() {
  initScene();
  const planets = await fetchPlanetPositions();
  createSolarSystem(planets);
  animate();
}

init();
