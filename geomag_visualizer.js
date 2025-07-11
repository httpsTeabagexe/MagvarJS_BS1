
// --- Marching Squares Helper Functions ---
function lerp(threshold, p1_val, p2_val) {
    // Avoid division by zero
    if (p2_val - p1_val === 0) {
        return 0.5;
    }
    // Calculate the interpolation factor
    return (threshold - p1_val) / (p2_val - p1_val);
}

function binaryToType(nw, ne, se, sw) {
    // Create a bitmask from the boolean corner values
    let type = 0;
    if (nw) type |= 8;
    if (ne) type |= 4;
    if (se) type |= 2;
    if (sw) type |= 1;
    return type;
}


const MagMapApp = {
    // --- Configuration ---
    config: {
        igdgc: 1, // Geodetic coordinate system flag
        mapWidth: 960, // Width of the SVG map
        mapHeight: 550, // Height of the SVG map
        gridResolutionLat: 90, // Number of latitude grid points
        gridResolutionLon: 180, // Number of longitude grid points
        worldAtlasURL: './data/countries-110m.json', // Path to world map TopoJSON
        cofURL: './data/IGRF14.COF' // Path to IGRF coefficient file
    },

    // --- Application State ---
    geomagInstance: null, // Instance of Geomag class
    cofFileContentCache: null, // Cached content of COF file
    isSmoothingEnabled: true, // Control for interpolation/smoothing

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
        document.getElementById('fieldSelect').addEventListener('change', () => this.handleRenderClick());
        const smoothingButton = document.getElementById('smoothingButton');
        smoothingButton.addEventListener('click', () => {
            this.isSmoothingEnabled = !this.isSmoothingEnabled;
            smoothingButton.textContent = this.isSmoothingEnabled ? 'Smoothing: On' : 'Smoothing: Off';
            this.handleRenderClick();
        });
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
        const gridStep = parseFloat(document.getElementById('gridStepInput').value);
        const field = document.getElementById('fieldSelect').value;
        if (isNaN(currentEpoch) || isNaN(currentAltitude) || isNaN(gridStep) || gridStep <= 0) {
            this.updateStatus('Error: Invalid input. All values must be positive numbers (steps > 0).', true);
            return;
        }

        this.config.gridResolutionLat = Math.floor(180 / gridStep) + 1;
        this.config.gridResolutionLon = Math.floor(360 / gridStep) + 1;

        this.updateStatus(`Rendering ${field.charAt(0).toUpperCase() + field.slice(1)} for Epoch: ${currentEpoch.toFixed(2)}...`, false);

        try {
            await this.renderGeomagMap('geomag-map', this.geomagInstance, currentEpoch, currentAltitude, field);
            this.updateStatus(`Map rendered for Epoch: ${currentEpoch.toFixed(2)}.`, false);
        } catch (error) {
            console.error('Failed to render map:', error);
            this.updateStatus(`Error rendering map: ${error.message}`, true);
        }
    },

    renderGeomagMap: async function(svgId, geomagInstance, currentEpoch, currentAltitude, field) {
        const world = await d3.json(this.config.worldAtlasURL).catch(e => console.error("Failed to fetch world map data:", e));
        if (!world) return;
        const land = topojson.feature(world, world.objects.countries);
        const sphere = {type: "Sphere"};
        const dipPoles = await this.calculateDipPoles(geomagInstance, currentEpoch, currentAltitude);
        const commonArgs = { geomagInstance, epoch: currentEpoch, altitudeKm: currentAltitude };

        let paramKey, title, legend;
        let positiveOptions, negativeOptions, zeroOptions;

        if (field === 'declination') {
            paramKey = 'd_deg';
            title = `Declination (D) degrees - Epoch ${currentEpoch.toFixed(2)}`;
            const step = 10;
            const colorFunc = d => d === 0 ? 'green' : (d > 0 ? '#C00000' : '#0000A0');
            const majorMultiplier = 2;
            const labelCondition = (v, s, m) => v === 0 || Math.abs(v) % (s * m) === 0;
            legend = [
                { color: "#C00000", text: "Declination East (+)" },
                { color: "#0000A0", text: "Declination West (-)" },
                { color: "green", text: "Zero Declination (Agonic)" }
            ];
            positiveOptions = { step, domain: [step, 180], colorFunc, majorMultiplier, labelCondition };
            negativeOptions = { step, domain: [-180, -step], colorFunc, majorMultiplier, labelCondition };
            zeroOptions = { step: 1, domain: [0, 0], colorFunc, majorMultiplier: 1, labelCondition };
        } else if (field === 'inclination') {
            paramKey = 'i_deg';
            title = `Inclination (I) degrees - Epoch ${currentEpoch.toFixed(2)}`;
            const step = 10;
            const colorFunc = d => d === 0 ? 'green' : (d > 0 ? '#C00000' : '#0000A0');
            const majorMultiplier = 2;
            const labelCondition = (v, s, m) => v === 0 || Math.abs(v) % (s * m) === 0;
            legend = [
                { color: "#C00000", text: "Inclination Down (+)" },
                { color: "#0000A0", text: "Inclination Up (-)" },
                { color: "green", text: "Zero Inclination (Equator)" }
            ];
            positiveOptions = { step, domain: [step, 90], colorFunc, majorMultiplier, labelCondition };
            negativeOptions = { step, domain: [-90, -step], colorFunc, majorMultiplier, labelCondition };
            zeroOptions = { step: 1, domain: [0, 0], colorFunc, majorMultiplier: 1, labelCondition };
        } else { // Total Field
            paramKey = 'f';
            title = `Total Field (F) nT - Epoch ${currentEpoch.toFixed(2)}`;
            const step = 2000;
            const colorFunc = () => '#A52A2A';
            const majorMultiplier = 5;
            const labelCondition = (v, s, m) => v % (s * m) === 0;
            legend = [ { color: "#A52A2A", text: "Total Intensity (F)" } ];
            positiveOptions = { step, domain: [20000, 66000], colorFunc, majorMultiplier, labelCondition };
            negativeOptions = { step, domain: [0, -1], colorFunc, majorMultiplier, labelCondition };
            zeroOptions = { step: 1, domain: [-1, -1], colorFunc, majorMultiplier, labelCondition };
        }

        const { pathGenerator, clippedGroup } = this.drawBaseMap(svgId, land, sphere, title, dipPoles);
        const gridData = this.generateGridData(commonArgs, paramKey);

        // --- ARTIFACT FIX: Apply a Gaussian blur to smooth the data grid ---
        if (this.isSmoothingEnabled) {
            this.applyGaussianBlur(gridData.values, gridData.width, gridData.height, 1.5);
        }

        const passes = [positiveOptions, negativeOptions, zeroOptions];
        for (const options of passes) {
            if (options.domain[0] <= options.domain[1]) {
                this.drawContourLayer(clippedGroup, pathGenerator, gridData, options);
            }
        }

        this.addLegend(svgId, legend);
    },

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

        const clipPathId = `${svgId}-clip-path`;
        svg.append("defs").append("clipPath")
            .attr("id", clipPathId)
            .append("path")
            .datum(sphereFeature)
            .attr("d", pathGenerator);

        const clippedGroup = svg.append("g")
            .attr("id", `${svgId}-clipped-group`) // Give the group an ID
            .attr("clip-path", `url(#${clipPathId})`);

        this.drawGraticules(clippedGroup, svg, projection, pathGenerator);

        clippedGroup.append("path")
            .datum(landFeatures)
            .attr("d", pathGenerator)
            .style("fill", "black")
            .style("stroke", "#336633")
            .style("stroke-width", 0.5);

        svg.append("path")
            .datum(sphereFeature)
            .attr("d", pathGenerator)
            .style("fill", "none")
            .style("stroke", "#333")
            .style("stroke-width", 1);

        svg.append("text").attr("class", "map-title")
           .attr("x", mapWidth / 2).attr("y", 20).attr("text-anchor", "middle")
           .style("font-size", "18px").style("font-family", "Arial, sans-serif").text(title);

        if (dipPoles) {
            svg.selectAll("text.dip-pole").data(dipPoles).enter().append("text")
                .attr("transform", d => {
                    // Accept both abs and standard coordinates for dip poles
                    let lon = d.lon > 180 ? d.lon - 360 : d.lon;
                    let lat = d.lat > 90 ? 90 - d.lat : d.lat;
                    return `translate(${projection([lon, lat])})`;
                })
                .style("fill", "black").style("font-size", "24px").style("text-anchor", "middle").attr("dy", ".35em")
                .style("paint-order", "stroke").style("stroke", "white").style("stroke-width", "2px")
                .text("✱");
        }
        return { projection, pathGenerator, clippedGroup };
    },

    // --- MODIFIED: Manual Marching Squares Implementation ---
    drawContourLayer: function(container, pathGenerator, gridData, options) {
        const { step, domain, colorFunc, majorMultiplier, labelCondition } = options;

        const levels = d3.range(domain[0], domain[1] + (step / 2), step);
        if (domain[0] === 0 && domain[1] === 0 && !levels.includes(0)) levels.push(0);
        if (levels.length === 0) return;

        const contourGroup = container.append("g").attr("class", `contours-manual`);

        // --- FIXED: New coordinate conversion function ---
        // Converts interpolated grid coordinates (p.x, p.y) into geographic lon/lat
        const toGeo = (p) => {
             // p.x is in grid coordinates. The grid width covers 360 degrees of longitude.
            const lonAbs = (p.x / (gridData.width - 1)) * 360;
            // p.y is in grid coordinates. The grid height covers 180 degrees of latitude.
            const latAbs = (p.y / (gridData.height - 1)) * 180;

            const lon = lonAbs - 180;
            const lat = 90 - latAbs;

            // Failsafe to prevent returning NaN if an input was somehow invalid
            if (isNaN(lon) || isNaN(lat)) return null;

            return [lon, lat];
        };

        for (const level of levels) {
            const lines = [];
            for (let y = 0; y < gridData.height - 1; y++) {
                for (let x = 0; x < gridData.width - 1; x++) {

                    const nw_val = gridData.values[y * gridData.width + x];
                    const ne_val = gridData.values[y * gridData.width + x + 1];
                    const sw_val = gridData.values[(y + 1) * gridData.width + x];
                    const se_val = gridData.values[(y + 1) * gridData.width + x + 1];

                    const type = binaryToType(
                        nw_val > level, ne_val > level, se_val > level, sw_val > level
                    );

                    if (type === 0 || type === 15) continue;

                    let a, b, c, d;
                    if (this.isSmoothingEnabled) {
                        // Interpolated points
                        a = { x: x + lerp(level, nw_val, ne_val), y: y };
                        b = { x: x + 1, y: y + lerp(level, ne_val, se_val) };
                        c = { x: x + lerp(level, sw_val, se_val), y: y + 1 };
                        d = { x: x, y: y + lerp(level, nw_val, sw_val) };
                    } else {
                        // Midpoints
                        a = { x: x + 0.5, y: y };
                        b = { x: x + 1, y: y + 0.5 };
                        c = { x: x + 0.5, y: y + 1 };
                        d = { x: x, y: y + 0.5 };
                    }

                    switch (type) {
                        case 1: case 14: lines.push([d, c]); break;
                        case 2: case 13: lines.push([c, b]); break;
                        case 3: case 12: lines.push([d, b]); break;
                        case 4: case 11: lines.push([a, b]); break;
                        case 5: lines.push([d, a]); lines.push([c, b]); break;
                        case 6: case 9:  lines.push([a, c]); break;
                        case 7: case 8:  lines.push([d, a]); break;
                        case 10: lines.push([a, d]); lines.push([b, c]); break;
                    }
                }
            }

            // A single MultiLineString is more efficient for SVG rendering than many individual paths.
            if (lines.length > 0) {
                 const geoJson = {
                    type: "MultiLineString",
                    coordinates: lines.map(line => {
                        const start = toGeo(line[0]);
                        const end = toGeo(line[1]);
                        // Filter out invalid lines and those that wrap awkwardly across the antimeridian
                        if (!start || !end || Math.abs(start[0] - end[0]) > 180) return [];
                        return [start, end];
                    }).filter(d => d.length > 0)
                };

                contourGroup.append("path")
                    .datum(geoJson)
                    .attr("d", pathGenerator)
                    .style("fill", "none")
                    .style("stroke", colorFunc(level))
                    .style("stroke-width", labelCondition(level, step, majorMultiplier) ? 2.0 : 1.0);
            }
        }
    },


    // --- Data Smoothing Helpers ---
    applyGaussianBlur: function(data, width, height, radius) {
        const blurKernel = this.createGaussianBlurKernel(radius);
        const mid = Math.floor(blurKernel.length / 2);
        const temp = new Float32Array(data.length);

        // Horizontal pass
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                for (let i = 0; i < blurKernel.length; i++) {
                    let col = x + i - mid;
                    if (col < 0) col = 0;
                    if (col >= width) col = width - 1;
                    sum += data[y * width + col] * blurKernel[i];
                }
                temp[y * width + x] = sum;
            }
        }
        // Vertical pass
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                for (let i = 0; i < blurKernel.length; i++) {
                    let row = y + i - mid;
                    if (row < 0) row = 0;
                    if (row >= height) row = height - 1;
                    sum += temp[row * width + x] * blurKernel[i];
                }
                data[y * width + x] = sum;
            }
        }
    },

    createGaussianBlurKernel: function(radius) {
        const sigma = radius / 3;
        const size = Math.floor(radius * 2) + 1;
        const kernel = new Array(size);
        const sigma22 = 2 * sigma * sigma;
        const radiusInt = Math.floor(radius);
        let sum = 0;
        for (let i = 0; i < size; i++) {
            const x = i - radiusInt;
            const value = Math.exp(-(x * x) / sigma22);
            kernel[i] = value;
            sum += value;
        }
        for (let i = 0; i < size; i++) {
            kernel[i] /= sum;
        }
        return kernel;
    },

    addLegend, loadModelIntoInstance, generateGridData, calculateDipPoles, drawGraticules
};

MagMapApp.init();

function addLegend(svgId, legendItems) {
    const { mapHeight } = MagMapApp.config;
    const svg = d3.select(`#${svgId}`);
    svg.selectAll("g.legend").remove();
    const legendGroup = svg.append("g").attr("class", "legend").attr("transform", `translate(30, ${mapHeight - 80})`);
    legendItems.forEach((item, i) => {
        const legendRow = legendGroup.append("g").attr("transform", `translate(0, ${i * 20})`);
        legendRow.append("rect").attr("width", 18).attr("height", 18).style("fill", item.color).style("stroke", "black").style("stroke-width", 0.5);
        legendRow.append("text").attr("x", 24).attr("y", 9).attr("dy", "0.35em").style("font-size", "11px").style("font-family", "Arial, sans-serif").text(item.text);
    });
}

function loadModelIntoInstance(geomagInstance, cofFileContent) {
    try {
        geomagInstance.modelData = cofFileContent.split(/\r?\n/);
        let modelI = -1;
        geomagInstance.modelData.forEach((line, index) => {
            if (/^\s{3,}/.test(line)) {
                modelI++;
                if (modelI >= 30) throw new Error("Too many models");
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

// --- MODIFIED: generateGridData now handles NaN values ---
function generateGridData(commonArgs, paramKey) {
    const { geomagInstance, epoch, altitudeKm } = commonArgs;
    const { igdgc, gridResolutionLat, gridResolutionLon } = MagMapApp.config;

    const width = gridResolutionLon;
    const height = gridResolutionLat;
    const values = new Float32Array(width * height);

    const latAbsArr = d3.range(0, 180, 180 / (height - 1)).concat(180);
    const lonAbsArr = d3.range(0, 360, 360 / (width - 1)).concat(360);

    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            let lat = 90 - latAbsArr[i];
            let lon = lonAbsArr[j] - 180;

            const pointGeomag = new Geomag();
            pointGeomag.modelData = geomagInstance.modelData;
            Object.assign(pointGeomag, {
                model: geomagInstance.model.slice(),
                nmodel: geomagInstance.nmodel,
                epoch: geomagInstance.epoch.slice(),
                yrmin: geomagInstance.yrmin.slice(),
                yrmax: geomagInstance.yrmax.slice(),
                altmin: geomagInstance.altmin.slice(),
                altmax: geomagInstance.altmax.slice(),
                max1: geomagInstance.max1.slice(),
                max2: geomagInstance.max2.slice(),
                max3: geomagInstance.max3.slice(),
                irec_pos: geomagInstance.irec_pos.slice()
            });
            const field = pointGeomag.getFieldComponents(epoch, igdgc, altitudeKm, lat, lon);

            let value = field[paramKey];
            // --- FIXED: Check for and handle NaN values at the source ---
            if (isNaN(value)) {
                // If we get NaN (e.g., declination at the pole), use the value
                // from the previous point in the row, or default to 0.
                value = j > 0 ? values[i * width + (j - 1)] : 0;
            }
            values[i * width + j] = value;
        }
    }
    return { values, width, height };
}

async function calculateDipPoles(geomagInstance, epoch, altitudeKm) {
    const { igdgc } = MagMapApp.config;
    let poles = [];
    const findPole = async (startLat, latDir) => {
        let bestPoint = { lat: startLat, lon: 0, val: latDir * -Infinity };
        // Use absolute coordinates for search
        for (let latAbs = 0; latAbs <= 180; latAbs += 10) {
            let lat = 90 - latAbs;
            for (let lonAbs = 0; lonAbs < 360; lonAbs += 20) {
                let lon = lonAbs - 180;
                const tempGeomag = new Geomag();
                tempGeomag.modelData = geomagInstance.modelData;
                Object.assign(tempGeomag, {
                    model: geomagInstance.model.slice(),
                    nmodel: geomagInstance.nmodel,
                    epoch: geomagInstance.epoch.slice(),
                    yrmin: geomagInstance.yrmin.slice(),
                    yrmax: geomagInstance.yrmax.slice(),
                    altmin: geomagInstance.altmin.slice(),
                    altmax: geomagInstance.altmax.slice(),
                    max1: geomagInstance.max1.slice(),
                    max2: geomagInstance.max2.slice(),
                    max3: geomagInstance.max3.slice(),
                    irec_pos: geomagInstance.irec_pos.slice()
                });
                const field = tempGeomag.getFieldComponents(epoch, igdgc, altitudeKm, lat, lon);
                if (!isNaN(field.i_deg) && (latDir * field.i_deg > latDir * bestPoint.val)) {
                    bestPoint = { lat, latAbs, lon, lonAbs, val: field.i_deg };
                }
            }
        }
        // Refine search
        let searchRadius = 5, searchStep = 1;
        for(let i=0; i<3; i++) {
            for(let latAbs = Math.max(0, bestPoint.latAbs - searchRadius); latAbs <= Math.min(180, bestPoint.latAbs + searchRadius); latAbs += searchStep) {
                let lat = 90 - latAbs;
                for(let lonAbs = Math.max(0, bestPoint.lonAbs - searchRadius); lonAbs <= Math.min(360, bestPoint.lonAbs + searchRadius); lonAbs += searchStep) {
                    let lon = lonAbs - 180;
                    const tempGeomag = new Geomag();
                    tempGeomag.modelData = geomagInstance.modelData;
                    Object.assign(tempGeomag, {
                        model: geomagInstance.model.slice(),
                        nmodel: geomagInstance.nmodel,
                        epoch: geomagInstance.epoch.slice(),
                        yrmin: geomagInstance.yrmin.slice(),
                        yrmax: geomagInstance.yrmax.slice(),
                        altmin: geomagInstance.altmin.slice(),
                        altmax: geomagInstance.altmax.slice(),
                        max1: geomagInstance.max1.slice(),
                        max2: geomagInstance.max2.slice(),
                        max3: geomagInstance.max3.slice(),
                        irec_pos: geomagInstance.irec_pos.slice()
                    });
                    const field = tempGeomag.getFieldComponents(epoch, igdgc, altitudeKm, lat, lon);
                    if (!isNaN(field.i_deg) && (latDir * field.i_deg > latDir * bestPoint.val)) {
                        bestPoint = { lat, latAbs, lon, lonAbs, val: field.i_deg };
                    }
                }
            }
            searchRadius /= 2; searchStep /= 2;
        }
        return bestPoint;
    };
    const northPole = await findPole(0, 1);
    if (northPole.val > 80) poles.push({ name: "North Dip Pole", lat: northPole.lat, latAbs: northPole.latAbs, lon: northPole.lon, lonAbs: northPole.lonAbs });
    const southPole = await findPole(180, -1);
    if (southPole.val < -80) poles.push({ name: "South Dip Pole", lat: southPole.lat, latAbs: southPole.latAbs, lon: southPole.lon, lonAbs: southPole.lonAbs });
    return poles;
}

function drawGraticules(clippedContainer, unclippedContainer, projection, pathGenerator) {
    const graticule = d3.geoGraticule();

    clippedContainer.append("path").datum(graticule.step([15, 15])).attr("d", pathGenerator).style("fill", "none").style("stroke", "#ccc").style("stroke-width", 0.5).style("stroke-dasharray", "2,2");
    clippedContainer.append("path").datum(graticule.step([30, 30])).attr("d", pathGenerator).style("fill", "none").style("stroke", "#aaa").style("stroke-width", 0.7);

    const graticuleGroup = unclippedContainer.append("g").attr("class", "graticule-labels").style("font-family", "sans-serif").style("font-size", "10px").style("fill", "#333");
    const bounds = pathGenerator.bounds({type: "Sphere"});
    const left = bounds[0][0], top = bounds[0][1], right = bounds[1][0], bottom = bounds[1][1];

    // Draw graticule labels using absolute coordinates
    for (let lonAbs = 0; lonAbs <= 360; lonAbs += 30) {
        const lon = lonAbs - 180;
        const point = projection([lon, 0]);
        if(point) {
            graticuleGroup.append("text").attr("x", point[0]).attr("y", top - 8).text(`${lonAbs}°`);
            graticuleGroup.append("text").attr("x", point[0]).attr("y", bottom + 15).text(`${lonAbs}°`);
        }
    }
    for (let latAbs = 0; latAbs <= 180; latAbs += 30) {
        if(latAbs === 90) continue;
        const lat = 90 - latAbs;
        const point = projection([0, lat]);
        if(point) {
            graticuleGroup.append("text").attr("x", left - 20).attr("y", point[1]).text(`${latAbs}°${lat > 0 ? 'N' : 'S'}`);
            graticuleGroup.append("text").attr("x", right + 20).attr("y", point[1]).text(`${latAbs}°${lat > 0 ? 'N' : 'S'}`);
        }
    }
    graticuleGroup.selectAll("text").style("text-anchor", "middle").attr("dy", ".35em");
}
