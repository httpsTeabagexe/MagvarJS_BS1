// geomag_visualizer.js
/**
 * Visualizes geomagnetic field data.
 * This version contains the final fix for declination rendering logic.
 */

const MagMapApp = {
    // --- Configuration ---
    config: {
        igdgc: 1,
        mapWidth: 960,
        mapHeight: 550,
        gridResolutionLat: 90,
        gridResolutionLon: 180,
        worldAtlasURL: './data/countries-110m.json',
        cofURL: './data/IGRF14.COF'
    },

    // --- Application State ---
    geomagInstance: null,
    cofFileContentCache: null,

    // --- Main Initializer ---
    init: function() {
        document.addEventListener('DOMContentLoaded', () => {
            this.setupUIListeners();
            this.initializeGeomag();
        });
    },

    // --- UI and Event Handling ---
    setupUIListeners: function() {
        document.getElementById('renderButton').addEventListener('click', () => this.handleRenderClick());
    },

    updateStatus: function(message, isError = false) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.style.color = isError ? 'red' : '#555';
        }
    },

    // --- Core Geomagnetic Logic ---
    initializeGeomag: async function() {
        if (typeof Geomag === 'undefined') {
            this.updateStatus('Error: Geomag class not found.', true);
            return false;
        }
        this.geomagInstance = new Geomag();
        try {
            if (!this.cofFileContentCache) {
                this.updateStatus('Fetching .COF model file...');
                const response = await fetch(this.config.cofURL);
                if (!response.ok) throw new Error(`Failed to fetch COF file: ${response.statusText}`);
                this.cofFileContentCache = await response.text();
            }
            this.updateStatus('Loading COF model data...');
            if (!this.loadModelIntoInstance(this.geomagInstance, this.cofFileContentCache)) {
                this.updateStatus('Error: Failed to load model data.', true);
                return false;
            }
            this.updateStatus(`Model loaded. Valid range: ${this.geomagInstance.minyr.toFixed(1)} - ${this.geomagInstance.maxyr.toFixed(1)}. Ready.`);
            this.handleRenderClick();
            return true;
        } catch (error) {
            console.error('Initialization failed:', error);
            this.updateStatus(`Error initializing: ${error.message}`, true);
            return false;
        }
    },

    handleRenderClick: async function() {
        if (!this.geomagInstance || this.geomagInstance.nmodel === 0) {
            this.updateStatus('Initializing Geomag model first...', false);
            const initialized = await this.initializeGeomag();
            if (!initialized) return;
        }

        const currentEpoch = parseFloat(document.getElementById('epochInput').value);
        const currentAltitude = parseFloat(document.getElementById('altitudeInput').value);
        const decStep = parseFloat(document.getElementById('decStepInput').value);
        const incStep = parseFloat(document.getElementById('incStepInput').value);
        const fStep = parseFloat(document.getElementById('fStepInput').value);

        if (isNaN(currentEpoch) || isNaN(currentAltitude) || isNaN(decStep) || isNaN(incStep) || isNaN(fStep) || decStep <= 0 || incStep <= 0 || fStep <= 0) {
            this.updateStatus('Error: Invalid input. All values must be positive numbers (steps > 0).', true);
            return;
        }

        this.updateStatus(`Rendering for Epoch: ${currentEpoch.toFixed(2)}...`, false);

        try {
            await this.renderGeomagneticMaps(
                'declination-map', 'inclination-map', 'totalfield-map',
                this.geomagInstance, currentEpoch, currentAltitude,
                { decStep, incStep, fStep }
            );
            this.updateStatus(`Maps rendered for Epoch: ${currentEpoch.toFixed(2)}.`, false);
        } catch (error) {
            console.error('Failed to render maps:', error);
            this.updateStatus(`Error rendering maps: ${error.message}`, true);
        }
    },

    // --- Visualization and Data Generation ---

    renderGeomagneticMaps: async function(declinationSvgId, inclinationSvgId, totalFieldSvgId, geomagInstance, currentEpoch, currentAltitude, steps) {
        let world = await d3.json(this.config.worldAtlasURL).catch(e => console.error("Failed to fetch world map data:", e));
        if (!world) return;
        const land = topojson.feature(world, world.objects.countries);
        const sphere = {type: "Sphere"};
        const dipPoles = await this.calculateDipPoles(geomagInstance, currentEpoch, currentAltitude);
        const commonArgs = { geomagInstance, epoch: currentEpoch, altitudeKm: currentAltitude };

        // --- **DECLINATION MAP (FIXED MULTI-PASS)** ---
        const decData = this.generateGridData(commonArgs, 'd_deg');
        this.drawDeclinationMap(declinationSvgId, decData, land, sphere, dipPoles, `Declination (D) degrees - Epoch ${currentEpoch.toFixed(2)}`, steps.decStep);

        // --- INCLINATION MAP ---
        const incData = this.generateGridData(commonArgs, 'i_deg');
        this.drawMap(inclinationSvgId, incData, land, sphere, `Inclination (I) degrees - Epoch ${currentEpoch.toFixed(2)}`, {
            step: steps.incStep, domain: [-90, 90], colorFunc: (d) => d === 0 ? 'green' : (d > 0 ? '#C00000' : '#0000A0'), majorMultiplier: 2, labelCondition: (v, s, m) => v === 0 || Math.abs(v) % (s * m) === 0, dipPoles: dipPoles
        });

        // --- TOTAL FIELD MAP ---
        const fData = this.generateGridData(commonArgs, 'f');
        this.drawMap(totalFieldSvgId, fData, land, sphere, `Total Field (F) nT - Epoch ${currentEpoch.toFixed(2)}`, {
            step: steps.fStep, domain: [20000, 66000], colorFunc: () => '#A52A2A', majorMultiplier: 5, labelCondition: (v, s, m) => v % (s * m) === 0, dipPoles: dipPoles
        });
    },

    // A dedicated function to handle the multi-part drawing for Declination
    drawDeclinationMap: function(svgId, decData, land, sphere, dipPoles, title, step) {
        // --- 1. Draw the base map (land, graticules, title, poles) and get the projection ---
        const projection = this.drawBaseMap(svgId, land, sphere, title, dipPoles);

        // --- 2. Define options for each contour set ---
        const colorFunc = (d) => d === 0 ? 'green' : (d > 0 ? '#C00000' : '#0000A0');
        const labelCondition = (v, s, m) => v === 0 || Math.abs(v) % (s * m) === 0;
        const majorMultiplier = 2;

        const positiveOptions = { step, domain: [step, 180], colorFunc, majorMultiplier, labelCondition };
        const negativeOptions = { step, domain: [-180, -step], colorFunc, majorMultiplier, labelCondition };
        const zeroOptions = { step: 1, domain: [0, 0], colorFunc, majorMultiplier: 1, labelCondition };

        // --- 3. Draw each set of contours onto the existing SVG ---
        this.drawContourLayer(svgId, projection, decData, positiveOptions);
        this.drawContourLayer(svgId, projection, decData, negativeOptions);
        this.drawContourLayer(svgId, projection, decData, zeroOptions);

        // --- 4. Add the legend ---
        this.addLegend(svgId);
    },

    // Generic drawMap for continuous data like Inclination and Total Field
    drawMap: function(svgId, gridData, landFeatures, sphereFeature, title, options) {
        const projection = this.drawBaseMap(svgId, landFeatures, sphereFeature, title, options.dipPoles);
        this.drawContourLayer(svgId, projection, gridData, options);
    },

    // NEW helper to draw only the base map and return the configured projection
    drawBaseMap: function(svgId, landFeatures, sphereFeature, title, dipPoles) {
        const { mapWidth, mapHeight } = this.config;
        const svg = d3.select(`#${svgId}`);
        svg.selectAll("*").remove();

        svg.attr("width", mapWidth).attr("height", mapHeight)
           .attr("viewBox", [0, 0, mapWidth, mapHeight])
           .style("background-color", "#e0f3ff");

        const padding = 40;
        const projection = d3.geoMiller().fitSize([mapWidth - padding, mapHeight - padding], sphereFeature);
        const pathGenerator = d3.geoPath(projection);

        this.drawGraticuleWithLabels(svg, projection);

        svg.append("path").datum(landFeatures).attr("d", pathGenerator)
           .style("fill", "black").style("stroke", "#336633").style("stroke-width", 0.5);

        svg.append("path").datum(sphereFeature).attr("d", pathGenerator)
            .style("fill", "none").style("stroke", "#333").style("stroke-width", 1);

        svg.append("text").attr("x", mapWidth / 2).attr("y", 20).attr("text-anchor", "middle")
           .style("font-size", "18px").style("font-family", "Arial, sans-serif").text(title);

        if (dipPoles) {
            svg.selectAll("text.dip-pole").data(dipPoles).enter().append("text")
                .attr("transform", d => `translate(${projection([d.lon, d.lat])})`)
                .style("fill", "black").style("font-size", "24px").style("text-anchor", "middle").attr("dy", ".35em")
                .style("paint-order", "stroke").style("stroke", "white").style("stroke-width", "2px")
                .text("✱");
        }
        return projection; // Return the configured projection
    },

    // NEW helper to draw just the contour layer on an existing SVG with a given projection
    drawContourLayer: function(svgId, projection, gridData, options) {
        const { step, domain, colorFunc, majorMultiplier, labelCondition } = options;
        const svg = d3.select(`#${svgId}`);
        // --- START: The Fix for Projection Alignment ---
        // Create a transform that maps grid coordinates back to geographic coordinates
        // and then applies the map's projection.
        const transform = d3.geoTransform({
            point: function(x, y) {
                const lon = (x / (gridData.width - 1)) * 360 - 180;
                const lat = 90 - (y / (gridData.height - 1)) * 180;
                const projectedPoint = projection([lon, lat]);
                if (projectedPoint) {
                    this.stream.point(projectedPoint[0], projectedPoint[1]);
                }
            }
        });

        // Create a new path generator that uses our custom transform.
        const contourPathGenerator = d3.geoPath(transform);
        // --- END: The Fix for Projection Alignment ---

        const levels = d3.range(domain[0], domain[1] + 1, step);
        if (levels.length === 0) return;

        const contours = d3.contours().size([gridData.width, gridData.height]).thresholds(levels)(gridData.values);
        const contourGroup = svg.append("g").attr("class", "contours");

        contourGroup.selectAll("path.contour").data(contours).enter().append("path")
            .attr("id", (d, i) => `path-${svgId}-${domain[0]}-${i}`)
            // Use the new, corrected path generator for drawing
            .attr("d", contourPathGenerator)
            .style("fill", "none").style("stroke", d => colorFunc(d.value)).style("stroke-width", d => (labelCondition(d.value, step, majorMultiplier)) ? 2.0 : 1.0);

        contourGroup.selectAll("text.contour-label").data(contours).enter().append("text")
            .filter(d => labelCondition(d.value, step, majorMultiplier))
            .attr("dy", -3).append("textPath")
            .attr("xlink:href", (d, i) => `#path-${svgId}-${domain[0]}-${i}`)
            .attr("startOffset", "50%").style("text-anchor", "middle").style("fill", "black").style("font-size", "9px")
            .style("paint-order", "stroke").style("stroke", "white").style("stroke-width", "2.5px").style("stroke-linejoin", "round")
            .text(d => d.value.toLocaleString());

        // Explicitly bring the entire contour group to the front to ensure it's on top of the land.
        contourGroup.raise();
    },

    addLegend: function(svgId) {
        const { mapHeight } = this.config;
        const legendItems = [
            { color: "#C00000", text: "Declination East (+)" },
            { color: "#0000A0", text: "Declination West (-)" },
            { color: "green", text: "Zero Declination (Agonic)" }
        ];
        const svg = d3.select(`#${svgId}`);
        const legendGroup = svg.append("g").attr("class", "legend").attr("transform", `translate(30, ${mapHeight - 80})`);
        legendItems.forEach((item, i) => {
            const legendRow = legendGroup.append("g").attr("transform", `translate(0, ${i * 20})`);
            legendRow.append("rect").attr("width", 18).attr("height", 18).style("fill", item.color).style("stroke", "black").style("stroke-width", 0.5);
            legendRow.append("text").attr("x", 24).attr("y", 9).attr("dy", "0.35em").style("font-size", "11px").style("font-family", "Arial, sans-serif").text(item.text);
        });
    },

    // The rest of the functions (loadModel, generateGridData, calculateDipPoles, etc.)
    // remain the same as the last version. I'll paste them here for a complete file.
    loadModelIntoInstance, generateGridData, calculateDipPoles, drawGraticuleWithLabels
};

// --- Helper functions are now assigned to the MagMapApp object ---
// ... (The full code for these functions is included below)

// --- Kick off the application ---
MagMapApp.init();

// --- Definitions for the helper functions ---
// (These are the same as the previous version)

function loadModelIntoInstance(geomagInstance, cofFileContent) {
    try {
        geomagInstance.modelData = cofFileContent.split(/\r?\n/);
        let modelI = -1;
        geomagInstance.modelData.forEach((line, index) => {
            if (/^\s{3,}/.test(line)) {
                modelI++;
                if (modelI >= MAXMOD) throw new Error("Too many models");
                const parts = line.trim().split(/\s+/);
                geomagInstance.model[modelI] = parts[0] || '';
                geomagInstance.epoch[modelI] = parseFloat(parts[1]) || 0;
                geomagInstance.max1[modelI] = parseInt(parts[2]) || 0;
                geomagInstance.max2[modelI] = parseInt(parts[3]) || 0;
                geomagInstance.max3[modelI] = parseInt(parts[4]) || 0;
                geomagInstance.yrmin[modelI] = parseFloat(parts[5]) || 0;
                geomagInstance.yrmax[modelI] = parseFloat(parts[6]) || 0;
                geomagInstance.altmin[modelI] = parseFloat(parts[7]) || 0;
                geomagInstance.altmax[modelI] = parseFloat(parts[8]) || 0;
                geomagInstance.irec_pos[modelI] = index + 1;
                if (modelI === 0) {
                    geomagInstance.minyr = geomagInstance.yrmin[0];
                    geomagInstance.maxyr = geomagInstance.yrmax[0];
                } else {
                    if (geomagInstance.yrmin[modelI] < geomagInstance.minyr) geomagInstance.minyr = geomagInstance.yrmin[modelI];
                    if (geomagInstance.yrmax[modelI] > geomagInstance.maxyr) geomagInstance.maxyr = geomagInstance.yrmax[modelI];
                }
            }
        });
        geomagInstance.nmodel = modelI + 1;
        return geomagInstance.nmodel > 0;
    } catch (e) {
        console.error("Error loading model data into Geomag instance:", e);
        return false;
    }
}

function generateGridData(commonArgs, paramKey) {
    const { geomagInstance, epoch, altitudeKm } = commonArgs;
    const { igdgc, gridResolutionLat, gridResolutionLon } = MagMapApp.config;

    // Create a grid that is one column wider to stitch the dateline
    const width = gridResolutionLon + 1;
    const height = gridResolutionLat;
    const values = new Float32Array(width * height);

    const lats = d3.range(90, -90 - 1e-9, -180 / (height - 1));
    // Generate longitudes from -180 to +180 (inclusive) to stitch the grid
    const lons = d3.range(-180, 180 + 1e-9, 360 / gridResolutionLon);

    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            const pointGeomag = new Geomag();
            pointGeomag.modelData = geomagInstance.modelData;
            Object.assign(pointGeomag, { model: geomagInstance.model.slice(), nmodel: geomagInstance.nmodel, epoch: geomagInstance.epoch.slice(), yrmin: geomagInstance.yrmin.slice(), yrmax: geomagInstance.yrmax.slice(), altmin: geomagInstance.altmin.slice(), altmax: geomagInstance.altmax.slice(), max1: geomagInstance.max1.slice(), max2: geomagInstance.max2.slice(), max3: geomagInstance.max3.slice(), irec_pos: geomagInstance.irec_pos.slice() });
            const field = pointGeomag.getFieldComponents(epoch, igdgc, altitudeKm, lats[i], lons[j]);
            values[i * width + j] = field[paramKey];
        }
    }
    return { values, width, height };
}

async function calculateDipPoles(geomagInstance, epoch, altitudeKm) {
    const { igdgc } = MagMapApp.config;
    let poles = [];
    const findPole = async (startLat, latDir) => {
        let bestPoint = { lat: startLat, lon: 0, val: latDir * -Infinity };
        for (let lat = startLat; Math.abs(lat) >= 60; lat -= latDir * 10) {
            for (let lon = -180; lon < 180; lon += 20) {
                 const tempGeomag = new Geomag(); tempGeomag.modelData = geomagInstance.modelData; Object.assign(tempGeomag, { model: geomagInstance.model.slice(), nmodel: geomagInstance.nmodel, epoch: geomagInstance.epoch.slice(), yrmin: geomagInstance.yrmin.slice(), yrmax: geomagInstance.yrmax.slice(), altmin: geomagInstance.altmin.slice(), altmax: geomagInstance.altmax.slice(), max1: geomagInstance.max1.slice(), max2: geomagInstance.max2.slice(), max3: geomagInstance.max3.slice(), irec_pos: geomagInstance.irec_pos.slice() });
                const field = tempGeomag.getFieldComponents(epoch, igdgc, altitudeKm, lat, lon);
                if (!isNaN(field.i_deg) && (latDir * field.i_deg > latDir * bestPoint.val)) { bestPoint = { lat, lon, val: field.i_deg }; }
            }
        }
        let searchRadius = 5, searchStep = 1;
        for(let i=0; i<3; i++) {
            for(let lat = bestPoint.lat - searchRadius; lat <= bestPoint.lat + searchRadius; lat += searchStep) {
                for(let lon = bestPoint.lon - searchRadius; lon <= bestPoint.lon + searchRadius; lon += searchStep) {
                     const tempGeomag = new Geomag(); tempGeomag.modelData = geomagInstance.modelData; Object.assign(tempGeomag, { model: geomagInstance.model.slice(), nmodel: geomagInstance.nmodel, epoch: geomagInstance.epoch.slice(), yrmin: geomagInstance.yrmin.slice(), yrmax: geomagInstance.yrmax.slice(), altmin: geomagInstance.altmin.slice(), altmax: geomagInstance.altmax.slice(), max1: geomagInstance.max1.slice(), max2: geomagInstance.max2.slice(), max3: geomagInstance.max3.slice(), irec_pos: geomagInstance.irec_pos.slice() });
                    const field = tempGeomag.getFieldComponents(epoch, igdgc, altitudeKm, lat, lon);
                    if (!isNaN(field.i_deg) && (latDir * field.i_deg > latDir * bestPoint.val)) { bestPoint = { lat, lon, val: field.i_deg }; }
                }
            }
            searchRadius /= 2; searchStep /= 2;
        }
        return bestPoint;
    };
    const northPole = await findPole(90, 1);
    if (northPole.val > 80) poles.push({ name: "North Dip Pole", lat: northPole.lat, lon: northPole.lon });
    const southPole = await findPole(-90, -1);
    if (southPole.val < -80) poles.push({ name: "South Dip Pole", lat: southPole.lat, lon: southPole.lon });
    return poles;
}

function drawGraticuleWithLabels(svg, projection) {
    const graticule = d3.geoGraticule();
    const pathGenerator = d3.geoPath(projection);
    const {mapWidth, mapHeight} = MagMapApp.config;

    svg.append("path").datum(graticule.step([15, 15])).attr("d", pathGenerator).style("fill", "none").style("stroke", "#ccc").style("stroke-width", 0.5).style("stroke-dasharray", "2,2");
    svg.append("path").datum(graticule.step([30, 30])).attr("d", pathGenerator).style("fill", "none").style("stroke", "#aaa").style("stroke-width", 0.7);

    const graticuleGroup = svg.append("g").attr("class", "graticule-labels").style("font-family", "sans-serif").style("font-size", "10px").style("fill", "#333");
    const bounds = pathGenerator.bounds({type: "Sphere"});
    const left = bounds[0][0], top = bounds[0][1], right = bounds[1][0], bottom = bounds[1][1];

    for (let lon = -150; lon <= 150; lon += 30) {
        const point = projection([lon, 0]);
        if(point) {
            graticuleGroup.append("text").attr("x", point[0]).attr("y", top - 8).text(`${Math.abs(lon)}°`);
            graticuleGroup.append("text").attr("x", point[0]).attr("y", bottom + 15).text(`${Math.abs(lon)}°`);
        }
    }
    for (let lat = -60; lat <= 60; lat += 30) {
        if(lat === 0) continue;
        const point = projection([0, lat]);
        if(point) {
            graticuleGroup.append("text").attr("x", left - 20).attr("y", point[1]).text(`${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`);
            graticuleGroup.append("text").attr("x", right + 20).attr("y", point[1]).text(`${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`);
        }
    }
    graticuleGroup.selectAll("text").style("text-anchor", "middle").attr("dy", ".35em");
}