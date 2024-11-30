import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as GeoTIFF from 'geotiff';
import Stats from 'three/addons/libs/stats.module.js';

let container, stats;
let camera, controls, scene, renderer;
let mesh, texture;
let raycaster, pointer, helper;

let minElevation, maxElevation;

async function loadGeoTIFF(file) {
    // Read the GeoTIFF file
    const response = await fetch(file);
    const arrayBuffer = await response.arrayBuffer();
    const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    
    // Get raster data
    const rasters = await image.readRasters();
    const width = image.getWidth();
    const height = image.getHeight();
    
    // Assuming single band elevation data
    const elevationData = rasters[0];
    
    // Normalize elevation data
    minElevation = elevationData.reduce((min, val) => Math.min(min, val), Infinity);
    maxElevation = elevationData.reduce((max, val) => Math.max(max , val), -Infinity);

    // const normalizedData = elevationData.map(
    //     value => (value - minElevation) / (maxElevation - minElevation) 
    // );

    return {
        data: elevationData,
        width,
        height
    };
}



async function initTerrain(terrainData) {
    // Clear previous scene
    if (scene) {
        scene.remove(mesh);
    }

    // Create geometry
    const geometry = new THREE.PlaneGeometry(
        7500, 
        7500, 
        terrainData.width - 1, 
        terrainData.height - 1
    );
    geometry.rotateX(-Math.PI / 2);

    // Modify vertex heights
    const vertices = geometry.attributes.position.array;
    for (let i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {
        vertices[j + 1] = terrainData.data[i] || 0;
    }

    // Generate texture
    texture = new THREE.CanvasTexture(generateTexture(terrainData.data, terrainData.width, terrainData.height));
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;

    // Create mesh
    mesh = new THREE.Mesh(
        geometry, 
        new THREE.MeshBasicMaterial({ map: texture })
    );
    scene.add(mesh);

    // Adjust camera
    controls.target.y = terrainData.data[Math.floor(terrainData.data.length / 2)] || 0;
    camera.position.y = controls.target.y + 2000;
    camera.position.x = 2000;
    controls.update();
}

function generateTexture(data, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    const image = context.createImageData(width, height);
    const imageData = image.data;

    for (let i = 0, j = 0, l = imageData.length; i < l; i += 4, j++) {    
        
        // /* For Color */
        // const normalized = (data[j] - minElevation) / (maxElevation - minElevation);

        // // Define a gradient from blue (low) to green (mid) to red (high)
        // const r = Math.min(255, Math.max(0, Math.round(255 * normalized))); // Red increases with elevation
        // const g = Math.min(255, Math.max(0, Math.round(255 * (1 - Math.abs(normalized - 0.5) * 2)))); // Green peaks at mid
        // const b = Math.min(255, Math.max(0, Math.round(255 * (1 - normalized)))); // Blue decreases with elevation

        // imageData[i] = r;     // R
        // imageData[i + 1] = g; // G
        // imageData[i + 2] = b; // B
        // imageData[i + 3] = 255; 
        
        
        /* For Grayscale */
        const normalized = (data[j] - minElevation) / (maxElevation - minElevation);

        // Define a gradient from blue (low) to green (mid) to red (high)
        const r = Math.min(255, Math.max(0, Math.round(255 * normalized))); 
        const g = Math.min(255, Math.max(0, Math.round(255 * normalized))); 
        const b = Math.min(255, Math.max(0, Math.round(255 * normalized))); 
        imageData[i] = r;     // R
        imageData[i + 1] = g; // G
        imageData[i + 2] = b; // B
        imageData[i + 3] = 255; 

    }

    context.putImageData(image, 0, 0);
    return canvas;
}

async function init() {
    container = document.getElementById('terrain-container');
    container.innerHTML = '';

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setAnimationLoop(animate);
    container.appendChild(renderer.domElement);

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfd1e5);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 10, 20000);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 1000;
    controls.maxDistance = 10000;
    controls.maxPolarAngle = Math.PI / 2;

    // Raycaster for interaction
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    // Helper
    const geometryHelper = new THREE.ConeGeometry(20, 100, 3);
    geometryHelper.translate(0, 50, 0);
    geometryHelper.rotateX(Math.PI / 2);
    helper = new THREE.Mesh(geometryHelper, new THREE.MeshNormalMaterial());
    scene.add(helper);

    // Event listeners
    container.addEventListener('pointermove', onPointerMove);
    window.addEventListener('resize', onWindowResize);

    // Stats
    stats = new Stats();
    container.appendChild(stats.dom);

    try {
        const terrainData = await loadGeoTIFF('study_area.tif');
        // const terrainData = await loadGeoTIFF('cdnh43e.tif');
        await initTerrain(terrainData);
    } catch (error) {
        console.error('Error loading GeoTIFF:', error);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    render();
    stats.update();
}

function render() {
    renderer.render(scene, camera);
}

function onPointerMove(event) {
    pointer.x = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
    pointer.y = -(event.clientY / renderer.domElement.clientHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    // See if the ray from the camera into the world hits our mesh
    const intersects = raycaster.intersectObject(mesh);

    // Update helper position
    if (intersects.length > 0) {
        helper.position.set(0, 0, 0);
        helper.lookAt(intersects[0].face.normal);
        helper.position.copy(intersects[0].point);
    }
}

// Initialize the scene
init();