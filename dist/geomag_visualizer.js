var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as d3 from 'd3';
import { feature as topojsonFeature } from 'topojson-client';
// --- Marching Squares Helper Functions ---
function LERP(threshold, p1_val, p2_val) {
    if (p2_val - p1_val === 0)
        return 0.5;
    return (threshold - p1_val) / (p2_val - p1_val);
}
function BIN_TO_TYPE(nw, ne, se, sw) {
    let type = 0;
    if (nw)
        type |= 8;
    if (ne)
        type |= 4;
    if (se)
        type |= 2;
    if (sw)
        type |= 1;
    return type;
}
const K_MAG_MAP_APP = {
    // --- Configuration ---
    config: {
        igdgc: 1,
        mapWidth: 1200,
        mapHeight: 700,
        gridResolutionLat: 90,
        gridResolutionLon: 180,
        worldAtlasURL: './data/countries-110m.json',
        cofURL: './data/IGRF14.COF'
    },
    // --- Application State ---
    geomagInstance: null,
    cofFileContentCache: null,
    isSmoothingEnabled: true,
    isUncertaintyVisible: false,
    projection: null,
    clickInfoWindow: null,
    currentClickPoint: null,
    currentIsolines: null,
    // --- Main Initializer ---
    init: function () {
        document.addEventListener('DOMContentLoaded', () => {
            console.log("Initializing...");
            try {
                this.clickInfoWindow = d3.select("body").append("div")
                    .attr("class", "coordinate-info");
                this.SETUP_UI_LISTENERS();
                this.INIT_GEOMAG();
            }
            catch (error) {
                console.error("Initialization error:", error);
            }
        });
    },
    // --- UI and Event Handling ---
    UPD_UNCERTAINTY_BTN_STATE: function () {
        const fieldSelect = document.getElementById('fieldSelect');
        const uncertaintyButton = document.getElementById('uncertaintyButton');
        const field = fieldSelect.value;
        if (field === 'totalfield') {
            uncertaintyButton.disabled = true;
            uncertaintyButton.setAttribute('aria-pressed', 'false');
            uncertaintyButton.style.cursor = 'not-allowed';
            uncertaintyButton.style.backgroundColor = '#ccc';
        }
        else {
            uncertaintyButton.disabled = false;
            uncertaintyButton.setAttribute('aria-pressed', String(this.isUncertaintyVisible));
            uncertaintyButton.style.cursor = 'pointer';
            uncertaintyButton.style.backgroundColor = '';
        }
    },
    SETUP_UI_LISTENERS: function () {
        const renderButton = document.getElementById('renderButton');
        const fieldSelect = document.getElementById('fieldSelect');
        const smoothingButton = document.getElementById('smoothingButton');
        const uncertaintyButton = document.getElementById('uncertaintyButton');
        renderButton.addEventListener('click', () => this.HANDLE_RENDER_CLICK());
        fieldSelect.addEventListener('change', () => {
            if (fieldSelect.value === 'totalfield')
                this.isUncertaintyVisible = false;
            this.UPD_UNCERTAINTY_BTN_STATE();
            this.HANDLE_RENDER_CLICK();
        });
        smoothingButton.addEventListener('click', () => {
            this.isSmoothingEnabled = !this.isSmoothingEnabled;
            smoothingButton.setAttribute('aria-pressed', String(this.isSmoothingEnabled));
            this.HANDLE_RENDER_CLICK();
        });
        uncertaintyButton.addEventListener('click', () => {
            if (!uncertaintyButton.disabled) {
                this.isUncertaintyVisible = !this.isUncertaintyVisible;
                this.UPD_UNCERTAINTY_BTN_STATE();
                this.HANDLE_RENDER_CLICK();
            }
        });
        smoothingButton.setAttribute('aria-pressed', String(this.isSmoothingEnabled));
        this.UPD_UNCERTAINTY_BTN_STATE();
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (this.clickInfoWindow && !target.closest('#geomag-map') && !target.closest('.coordinate-info')) {
                this.clickInfoWindow.style("display", "none");
            }
        });
    },
    UPD_STATUS: function (message, isError = false) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.style.color = isError ? 'red' : '#555';
        }
    },
    INIT_GEOMAG: function () {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof CL_GEOMAG === 'undefined') {
                this.UPD_STATUS('Error: CL_GEOMAG class not found.', true);
                return false;
            }
            this.geomagInstance = new CL_GEOMAG();
            try {
                if (!this.cofFileContentCache) {
                    this.UPD_STATUS('Fetching .COF model file...');
                    const response = yield fetch(this.config.cofURL);
                    if (!response.ok)
                        throw new Error(`Failed to fetch COF file: ${response.statusText}`);
                    this.cofFileContentCache = yield response.text();
                }
                this.UPD_STATUS('Loading COF model data...');
                if (!this.LOAD_MODEL_INTO_INSTANCE(this.geomagInstance, this.cofFileContentCache)) {
                    this.UPD_STATUS('Error: Failed to load model data.', true);
                    return false;
                }
                this.UPD_STATUS(`Model loaded. Valid range: ${this.geomagInstance.minyr.toFixed(1)} - ${this.geomagInstance.maxyr.toFixed(1)}. Ready.`);
                yield this.HANDLE_RENDER_CLICK();
                return true;
            }
            catch (error) {
                console.error('Initialization failed:', error);
                this.UPD_STATUS(`Error initializing: ${error.message}`, true);
                return false;
            }
        });
    },
    CLR_OVERLAYS: function () {
        const svg = d3.select("#geomag-map");
        svg.selectAll(".contours-manual, .caution-zone, .unreliable-zone, .legend").remove();
        this.CLR_CLICK_ELEMENTS();
    },
    IS_POINT_IN_MAP: function (x, y) {
        const svg = d3.select("#geomag-map");
        const width = +(svg.attr("width") || 0);
        const height = +(svg.attr("height") || 0);
        return x >= 0 && x <= width && y >= 0 && y <= height;
    },
    HANDLE_RENDER_CLICK: function () {
        return __awaiter(this, void 0, void 0, function* () {
            const renderButton = document.getElementById('renderButton');
            const epochInput = document.getElementById('epochInput');
            const altitudeInput = document.getElementById('altitudeInput');
            const gridStepInput = document.getElementById('gridStepInput');
            const fieldSelect = document.getElementById('fieldSelect');
            try {
                renderButton.disabled = true;
                this.UPD_STATUS('Rendering...', false);
                if (!this.geomagInstance || this.geomagInstance.nmodel === 0) {
                    this.UPD_STATUS('Initializing CL_GEOMAG model first...', false);
                    const initialized = yield this.INIT_GEOMAG();
                    if (!initialized)
                        return;
                }
                this.CLR_OVERLAYS();
                const currentEpoch = parseFloat(epochInput.value);
                const currentAltitude = parseFloat(altitudeInput.value);
                const gridStep = parseFloat(gridStepInput.value);
                const field = fieldSelect.value;
                if (isNaN(currentEpoch) || isNaN(currentAltitude) || isNaN(gridStep) || gridStep <= 0) {
                    this.UPD_STATUS('Error: Invalid input. All values must be positive numbers (steps > 0).', true);
                    return;
                }
                this.config.gridResolutionLat = Math.floor(180 / gridStep) + 1;
                this.config.gridResolutionLon = Math.floor(360 / gridStep) + 1;
                this.UPD_STATUS(`Rendering ${field.charAt(0).toUpperCase() + field.slice(1)} for Epoch: ${currentEpoch.toFixed(2)}...`, false);
                yield this.RENDER_GEOMAG_MAP('geomag-map', this.geomagInstance, currentEpoch, currentAltitude, field);
                this.UPD_STATUS(`Map rendered for Epoch: ${currentEpoch.toFixed(2)}.`, false);
            }
            catch (error) {
                console.error('Failed to render map:', error);
                this.UPD_STATUS(`Error rendering map: ${error.message}`, true);
            }
            finally {
                renderButton.disabled = false;
            }
        });
    },
    RENDER_GEOMAG_MAP: function (svgId, geomagInstance, currentEpoch, currentAltitude, field) {
        return __awaiter(this, void 0, void 0, function* () {
            this.CLR_OVERLAYS();
            const world = yield d3.json(this.config.worldAtlasURL);
            if (!world || !world.objects) {
                this.UPD_STATUS("Error: Invalid world atlas data.", true);
                return;
            }
            const land = topojsonFeature(world, world.objects.countries);
            const sphere = { type: "Sphere" };
            const dipPoles = yield this.CALCULATE_DIP_POLES();
            const commonArgs = { geomagInstance, epoch: currentEpoch, altitudeKm: currentAltitude };
            let paramKey, title, legend;
            let positiveOptions, negativeOptions, zeroOptions;
            if (field === 'declination') {
                paramKey = 'd_deg';
                title = `Declination (D) degrees - Epoch ${currentEpoch.toFixed(2)}`;
                const step = 10;
                const colorFunc = (d) => d === 0 ? 'green' : (d > 0 ? '#C00000' : '#0000A0');
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
            }
            else if (field === 'inclination') {
                paramKey = 'i_deg';
                title = `Inclination (I) degrees - Epoch ${currentEpoch.toFixed(2)}`;
                const step = 10;
                const colorFunc = (d) => d === 0 ? 'green' : (d > 0 ? '#C00000' : '#0000A0');
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
            }
            else {
                paramKey = 'f';
                title = `Total Field (F) nT - Epoch ${currentEpoch.toFixed(2)}`;
                const step = 2000;
                const colorFunc = () => '#A52A2A';
                const majorMultiplier = 5;
                const labelCondition = (v, s, m) => v % (s * m) === 0;
                legend = [{ color: "#A52A2A", text: "Total Intensity (F)" }];
                positiveOptions = { step, domain: [20000, 66000], colorFunc, majorMultiplier, labelCondition };
                negativeOptions = { step: 0, domain: [0, -1], colorFunc, majorMultiplier, labelCondition };
                zeroOptions = { step: 0, domain: [0, -1], colorFunc, majorMultiplier, labelCondition };
            }
            const { pathGenerator, clippedGroup } = this.DRAW_BASE_MAP(svgId, land, sphere, title, dipPoles);
            const gridData = this.GENERATE_GRID_DATA(commonArgs, paramKey);
            if (this.isSmoothingEnabled)
                this.APPLY_GAUSSIAN_BLUR(gridData.values, gridData.width, gridData.height, 1.5);
            const passes = [positiveOptions, negativeOptions, zeroOptions];
            for (const options of passes) {
                if (options.domain[0] <= options.domain[1]) {
                    this.DRAW_CONTOUR_LAYER(clippedGroup, pathGenerator, gridData, options);
                }
            }
            if (this.isUncertaintyVisible && (field === 'declination' || field === 'inclination')) {
                this.UPD_STATUS('Calculating blackout zones...', false);
                const hGridData = this.GENERATE_GRID_DATA(commonArgs, 'h');
                const paddedGrid = this.CREATE_PADDED_GRID(hGridData, 100000);
                this.DRAW_BLACKOUT_ZONES(clippedGroup, pathGenerator, paddedGrid);
                legend.push({ color: "rgba(255, 165, 0, 0.4)", text: "Caution Zone (H < 6000 nT)" });
                legend.push({ color: "rgba(255, 0, 0, 0.5)", text: "Unreliable Zone (H < 2000 nT)" });
            }
            this.ADD_LEGEND(svgId, legend);
        });
    },
    DRAW_BASE_MAP: function (svgId, landFeatures, sphereFeature, title, dipPoles) {
        const { mapWidth, mapHeight } = this.config;
        const svg = d3.select(`#${svgId}`);
        this.projection = d3.geoMercator().fitSize([mapWidth - 40, mapHeight - 40], sphereFeature);
        const pathGenerator = d3.geoPath(this.projection);
        svg.on("click", null);
        svg.attr("width", mapWidth).attr("height", mapHeight)
            .attr("viewBox", [0, 0, mapWidth, mapHeight])
            .style("background-color", "#e0f3ff");
        const clipPathId = `${svgId}-clip-path`;
        svg.append("defs").append("clipPath")
            .attr("id", clipPathId)
            .append("path")
            .datum(sphereFeature)
            .attr("d", pathGenerator);
        const clippedGroup = svg.append("g")
            .attr("id", `${svgId}-clipped-group`)
            .attr("clip-path", `url(#${clipPathId})`);
        this.DRAW_GRATICULES(clippedGroup, svg, this.projection, pathGenerator);
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
                .attr("transform", d => `translate(${this.projection([d.lon, d.lat])})`)
                .style("fill", "black").style("font-size", "24px").style("text-anchor", "middle").attr("dy", ".35em")
                .style("paint-order", "stroke").style("stroke", "white").style("stroke-width", "2px")
                .text("✱");
        }
        svg.on("click", (event) => {
            try {
                const [x, y] = d3.pointer(event);
                this.HANDLE_MAP_CLICK(x, y);
            }
            catch (error) {
                console.error("Error handling click event:", error);
            }
        });
        return { pathGenerator, clippedGroup };
    },
    HANDLE_MAP_CLICK: function (x, y) {
        if (!this.projection)
            return;
        this.CLR_CLICK_ELEMENTS();
        if (!this.IS_POINT_IN_MAP(x, y))
            return;
        try {
            const proj = this.projection;
            if (!proj || typeof proj.invert !== 'function')
                return;
            const coords = proj.invert([x, y]);
            if (!coords || coords.some(isNaN))
                return;
            this.currentClickPoint = { x, y, lon: coords[0], lat: coords[1] };
            const fieldData = this.GET_POINT_FIELD(coords);
            if (!fieldData)
                return;
            this.SHOW_COORD_INFO(x, y, coords, fieldData);
            this.DRAW_ISOLINES_FROM_POINT(coords, fieldData);
        }
        catch (error) {
            console.error("Error handling map click:", error);
        }
    },
    CLR_CLICK_ELEMENTS: function () {
        var _a, _b;
        (_a = this.clickInfoWindow) === null || _a === void 0 ? void 0 : _a.style("display", "none");
        (_b = this.currentIsolines) === null || _b === void 0 ? void 0 : _b.remove();
        this.currentIsolines = null;
    },
    GET_POINT_FIELD: function (coords) {
        if (!this.geomagInstance)
            return null;
        const [lon, lat] = coords;
        const epochInput = document.getElementById('epochInput');
        const altitudeInput = document.getElementById('altitudeInput');
        const currentEpoch = parseFloat(epochInput.value);
        const currentAltitude = parseFloat(altitudeInput.value);
        const pointGeomag = new CL_GEOMAG();
        pointGeomag.modelData = this.geomagInstance.modelData;
        Object.assign(pointGeomag, {
            model: this.geomagInstance.model.slice(), nmodel: this.geomagInstance.nmodel,
            epoch: this.geomagInstance.epoch.slice(), yrmin: this.geomagInstance.yrmin.slice(),
            yrmax: this.geomagInstance.yrmax.slice(), altmin: this.geomagInstance.altmin.slice(),
            altmax: this.geomagInstance.altmax.slice(), max1: this.geomagInstance.max1.slice(),
            max2: this.geomagInstance.max2.slice(), max3: this.geomagInstance.max3.slice(),
            irec_pos: this.geomagInstance.irec_pos.slice()
        });
        return pointGeomag.getFieldComponents(currentEpoch, this.config.igdgc, currentAltitude, lat, lon);
    },
    SHOW_COORD_INFO: function (x, y, coords, fieldData) {
        var _a, _b, _c, _d, _e, _f, _g;
        const [lon, lat] = coords;
        const fieldSelect = document.getElementById('fieldSelect');
        const field = fieldSelect.value;
        let fieldValue, fieldName;
        if (field === 'declination') {
            fieldValue = ((_a = fieldData.d_deg) === null || _a === void 0 ? void 0 : _a.toFixed(2)) + '°' || 'N/A';
            fieldName = 'Declination';
        }
        else if (field === 'inclination') {
            fieldValue = ((_b = fieldData.i_deg) === null || _b === void 0 ? void 0 : _b.toFixed(2)) + '°' || 'N/A';
            fieldName = 'Inclination';
        }
        else {
            fieldValue = ((_c = fieldData.f) === null || _c === void 0 ? void 0 : _c.toFixed(0)) + ' nT' || 'N/A';
            fieldName = 'Total Field';
        }
        const html = `
            <div><strong>Coordinates:</strong> ${lat.toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${lon.toFixed(2)}°${lon >= 0 ? 'E' : 'W'}</div>
            <div><strong>${fieldName}:</strong> ${fieldValue}</div>
            <div><strong>Horizontal (H):</strong> ${((_d = fieldData.h) === null || _d === void 0 ? void 0 : _d.toFixed(0)) || 'N/A'} nT</div>
            <div><strong>North (X):</strong> ${((_e = fieldData.x) === null || _e === void 0 ? void 0 : _e.toFixed(0)) || 'N/A'} nT</div>
            <div><strong>East (Y):</strong> ${((_f = fieldData.y) === null || _f === void 0 ? void 0 : _f.toFixed(0)) || 'N/A'} nT</div>
            <div><strong>Down (Z):</strong> ${((_g = fieldData.z) === null || _g === void 0 ? void 0 : _g.toFixed(0)) || 'N/A'} nT</div>
            <div class="close-btn">✕</div>
        `;
        if (this.clickInfoWindow) {
            this.clickInfoWindow.html(html)
                .style("left", `${x + 20}px`).style("top", `${y + 20}px`).style("display", "block");
            this.clickInfoWindow.select(".close-btn").on("click", () => this.CLR_CLICK_ELEMENTS());
        }
    },
    DRAW_ISOLINES_FROM_POINT: function (coords, fieldData) {
        if (!this.projection || !this.currentClickPoint)
            return;
        const svg = d3.select("#geomag-map");
        if (this.currentIsolines)
            this.currentIsolines.remove();
        const [lon, lat] = coords;
        const fieldSelect = document.getElementById('fieldSelect');
        const field = fieldSelect.value;
        const key = (field === 'declination' ? 'd_deg' : field === 'inclination' ? 'i_deg' : 'f');
        const currentValue = fieldData[key];
        this.currentIsolines = svg.append("g").attr("class", "isolines-group");
        this.currentIsolines.append("circle")
            .attr("cx", this.currentClickPoint.x).attr("cy", this.currentClickPoint.y)
            .attr("r", 5).attr("fill", "red").attr("stroke", "white").attr("stroke-width", 1);
        const pathGenerator = d3.geoPath().projection(this.projection);
        const circle = d3.geoCircle().center([lon, lat]).radius(2);
        this.currentIsolines.append("path").datum(circle()).attr("d", pathGenerator).attr("class", "isolines");
        this.currentIsolines.append("text")
            .attr("x", this.currentClickPoint.x + 10).attr("y", this.currentClickPoint.y - 10)
            .attr("class", "isolines-label").text(`${currentValue.toFixed(field === 'totalfield' ? 0 : 1)}`);
    },
    DRAW_CONTOUR_LAYER: function (container, pathGenerator, gridData, options) {
        const { step, domain, colorFunc, majorMultiplier, labelCondition } = options;
        const levels = d3.range(domain[0], domain[1] + (step / 2), step);
        if (domain[0] === 0 && domain[1] === 0 && !levels.includes(0))
            levels.push(0);
        if (levels.length === 0)
            return;
        const contourGroup = container.append("g").attr("class", `contours-manual`);
        const toGeo = (p) => {
            const lon = (p.x / (gridData.width - 1)) * 360 - 180;
            const lat = 90 - (p.y / (gridData.height - 1)) * 180;
            return isNaN(lon) || isNaN(lat) ? null : [lon, lat];
        };
        for (const level of levels) {
            const lines = [];
            for (let y = 0; y < gridData.height - 1; y++) {
                for (let x = 0; x < gridData.width - 1; x++) {
                    const nw_val = gridData.values[y * gridData.width + x];
                    const ne_val = gridData.values[y * gridData.width + x + 1];
                    const sw_val = gridData.values[(y + 1) * gridData.width + x];
                    const se_val = gridData.values[(y + 1) * gridData.width + x + 1];
                    const type = BIN_TO_TYPE(nw_val > level, ne_val > level, se_val > level, sw_val > level);
                    if (type === 0 || type === 15)
                        continue;
                    let a, b, c, d;
                    if (this.isSmoothingEnabled) {
                        a = { x: x + LERP(level, nw_val, ne_val), y: y };
                        b = { x: x + 1, y: y + LERP(level, ne_val, se_val) };
                        c = { x: x + LERP(level, sw_val, se_val), y: y + 1 };
                        d = { x: x, y: y + LERP(level, nw_val, sw_val) };
                    }
                    else {
                        a = { x: x + 0.5, y: y };
                        b = { x: x + 1, y: y + 0.5 };
                        c = { x: x + 0.5, y: y + 1 };
                        d = { x: x, y: y + 0.5 };
                    }
                    switch (type) {
                        case 1:
                        case 14:
                            lines.push([d, c]);
                            break;
                        case 2:
                        case 13:
                            lines.push([c, b]);
                            break;
                        case 3:
                        case 12:
                            lines.push([d, b]);
                            break;
                        case 4:
                        case 11:
                            lines.push([a, b]);
                            break;
                        case 5:
                            lines.push([d, a]);
                            lines.push([c, b]);
                            break;
                        case 6:
                        case 9:
                            lines.push([a, c]);
                            break;
                        case 7:
                        case 8:
                            lines.push([d, a]);
                            break;
                        case 10:
                            lines.push([a, d]);
                            lines.push([b, c]);
                            break;
                    }
                }
            }
            if (lines.length > 0) {
                const geoJson = {
                    type: "MultiLineString",
                    coordinates: lines.map(line => {
                        const start = toGeo(line[0]);
                        const end = toGeo(line[1]);
                        return (!start || !end || Math.abs(start[0] - end[0]) > 180) ? [] : [[start, end]];
                    }).filter(d => d.length > 0)
                };
                contourGroup.append("path").datum(geoJson).attr("d", pathGenerator)
                    .style("fill", "none").style("stroke", colorFunc(level))
                    .style("stroke-width", labelCondition(level, step, majorMultiplier) ? 2.0 : 1.0);
            }
        }
    },
    DRAW_BLACKOUT_ZONES: function (container, pathGenerator, paddedGridData) {
        const zones = [
            { threshold: 2000, color: "rgba(255, 0, 0, 0.5)" },
            { threshold: 6000, color: "rgba(255, 165, 0, 0.4)" }
        ];
        const { values: paddedValues, width: paddedWidth, height: paddedHeight } = paddedGridData;
        const originalWidth = paddedWidth - 2;
        const originalHeight = paddedHeight - 2;
        const geoTransform = (geometry) => {
            const transformPoint = (point) => {
                const lon = ((point[0] - 1) / (originalWidth - 1)) * 360 - 180;
                const lat = 90 - ((point[1] - 1) / (originalHeight - 1)) * 180;
                return [lon, lat];
            };
            const newCoordinates = geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(transformPoint)));
            return { type: "MultiPolygon", coordinates: newCoordinates, value: geometry.value };
        };
        const mapBackgroundColor = d3.select("#geomag-map").style("background-color");
        zones.forEach(zone => {
            container.append("path").datum({ type: "Sphere" }).attr("d", pathGenerator).style("fill", zone.color);
            const safeContours = d3.contours().size([paddedWidth, paddedHeight]).thresholds([zone.threshold]);
            // Convert Float32Array to Array for d3.contours
            const safeGeometries = safeContours(Array.from(paddedValues)).map(geoTransform);
            container.append("g").selectAll("path").data(safeGeometries).enter().append("path")
                .attr("d", pathGenerator).style("fill", mapBackgroundColor);
        });
    },
    APPLY_GAUSSIAN_BLUR: function (data, width, height, radius) {
        const blurKernel = this.CREATE_GAUSSIAN_BLUR_KERNEL(radius);
        const mid = Math.floor(blurKernel.length / 2);
        const temp = new Float32Array(data.length);
        // Horizontal pass
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                for (let i = 0; i < blurKernel.length; i++) {
                    let col = x + i - mid;
                    if (col < 0)
                        col = 0;
                    if (col >= width)
                        col = width - 1;
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
                    if (row < 0)
                        row = 0;
                    if (row >= height)
                        row = height - 1;
                    sum += temp[row * width + x] * blurKernel[i];
                }
                data[y * width + x] = sum;
            }
        }
    },
    CREATE_GAUSSIAN_BLUR_KERNEL: function (radius) {
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
        for (let i = 0; i < size; i++)
            kernel[i] /= sum;
        return kernel;
    },
    CREATE_PADDED_GRID: function (gridData, paddingValue) {
        const { values, width, height } = gridData;
        const paddedWidth = width + 2;
        const paddedHeight = height + 2;
        const paddedValues = new Float32Array(paddedWidth * paddedHeight);
        paddedValues.fill(paddingValue);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                paddedValues[(y + 1) * paddedWidth + (x + 1)] = values[y * width + x];
            }
        }
        return { values: paddedValues, width: paddedWidth, height: paddedHeight };
    },
    ADD_LEGEND: function (par_svgId, par_legendItems) {
        const { mapHeight, mapWidth } = this.config;
        const svg = d3.select(`#${par_svgId}`);
        svg.selectAll("g.legend").remove();
        const legendGroup = svg.append("g").attr("class", "legend")
            .attr("transform", `translate(${mapWidth / 2}, ${mapHeight - 30})`);
        const itemWidth = 150;
        const totalWidth = par_legendItems.length * itemWidth;
        const startX = -totalWidth / 2;
        par_legendItems.forEach((item, i) => {
            const legendItem = legendGroup.append("g").attr("transform", `translate(${startX + i * itemWidth}, 0)`);
            legendItem.append("rect").attr("x", 0).attr("y", 0).attr("width", 18).attr("height", 18)
                .style("fill", item.color).style("stroke", "black").style("stroke-width", 0.5);
            legendItem.append("text").attr("x", 24).attr("y", 9).attr("dy", "0.35em")
                .style("font-size", "11px").style("font-family", "Arial, sans-serif").text(item.text);
        });
    },
    LOAD_MODEL_INTO_INSTANCE: function (geomagInstance, cofFileContent) {
        try {
            geomagInstance.modelData = cofFileContent.split(/\r?\n/);
            let modelI = -1;
            geomagInstance.modelData.forEach((line, index) => {
                if (/^\s{3,}/.test(line)) {
                    modelI++;
                    if (modelI >= 30)
                        throw new Error("Too many models");
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
                    }
                    else {
                        if (geomagInstance.yrmin[modelI] < geomagInstance.minyr)
                            geomagInstance.minyr = geomagInstance.yrmin[modelI];
                        if (geomagInstance.yrmax[modelI] > geomagInstance.maxyr)
                            geomagInstance.maxyr = geomagInstance.yrmax[modelI];
                    }
                }
            });
            geomagInstance.nmodel = modelI + 1;
            return geomagInstance.nmodel > 0;
        }
        catch (e) {
            console.error("Error loading model data into CL_GEOMAG instance:", e);
            return false;
        }
    },
    GENERATE_GRID_DATA: function (commonArgs, paramKey) {
        const { geomagInstance, epoch, altitudeKm } = commonArgs;
        const { igdgc, gridResolutionLat, gridResolutionLon } = this.config;
        const width = gridResolutionLon;
        const height = gridResolutionLat;
        const values = new Float32Array(width * height);
        const latAbsArr = d3.range(0, 180, 180 / (height - 1)).concat(180);
        const lonAbsArr = d3.range(0, 360, 360 / (width - 1)).concat(360);
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                let lat = 90 - latAbsArr[i];
                let lon = lonAbsArr[j] - 180;
                const pointGeomag = new CL_GEOMAG();
                pointGeomag.modelData = geomagInstance.modelData;
                Object.assign(pointGeomag, {
                    model: geomagInstance.model.slice(), nmodel: geomagInstance.nmodel,
                    epoch: geomagInstance.epoch.slice(), yrmin: geomagInstance.yrmin.slice(),
                    yrmax: geomagInstance.yrmax.slice(), altmin: geomagInstance.altmin.slice(),
                    altmax: geomagInstance.altmax.slice(), max1: geomagInstance.max1.slice(),
                    max2: geomagInstance.max2.slice(), max3: geomagInstance.max3.slice(),
                    irec_pos: geomagInstance.irec_pos.slice()
                });
                const field = pointGeomag.getFieldComponents(epoch, igdgc, altitudeKm, lat, lon);
                let value = field[paramKey];
                if (isNaN(value))
                    value = j > 0 ? values[i * width + (j - 1)] : 0;
                values[i * width + j] = value;
            }
        }
        return { values, width, height };
    },
    CALCULATE_DIP_POLES: function () {
        return __awaiter(this, void 0, void 0, function* () {
            const poles = [];
            const findPole = (startLat, latDir) => __awaiter(this, void 0, void 0, function* () {
                let loc_best_point = { name: '', lat: startLat, lon: 0, val: latDir * -Infinity };
                for (let latAbs = 0; latAbs <= 180; latAbs += 10) {
                    let lat = 90 - latAbs;
                    for (let loc_lon_Abs = 0; loc_lon_Abs < 360; loc_lon_Abs += 20) {
                        let loc_lon = loc_lon_Abs - 180;
                        const field = this.GET_POINT_FIELD([loc_lon, lat]);
                        if (field && !isNaN(field.i_deg) && (latDir * field.i_deg > latDir * loc_best_point.val)) {
                            loc_best_point = { name: '', lat, latAbs, lon: loc_lon, lonAbs: loc_lon_Abs, val: field.i_deg };
                        }
                    }
                }
                let loc_search_radius = 5, searchStep = 1;
                for (let i = 0; i < 3; i++) {
                    for (let latAbs = Math.max(0, loc_best_point.latAbs - loc_search_radius); latAbs <= Math.min(180, loc_best_point.latAbs + loc_search_radius); latAbs += searchStep) {
                        let lat = 90 - latAbs;
                        for (let lonAbs = Math.max(0, loc_best_point.lonAbs - loc_search_radius); lonAbs <= Math.min(360, loc_best_point.lonAbs + loc_search_radius); lonAbs += searchStep) {
                            let lon = lonAbs - 180; //#TODO
                            const field = this.GET_POINT_FIELD([lon, lat]);
                            if (field && !isNaN(field.i_deg) && (latDir * field.i_deg > latDir * loc_best_point.val)) {
                                loc_best_point = { name: '', lat, latAbs, lon, lonAbs, val: field.i_deg };
                            }
                        }
                    }
                    loc_search_radius /= 2;
                    searchStep /= 2;
                }
                return loc_best_point;
            });
            const northPole = yield findPole(0, 1);
            if (northPole.val > 80)
                poles.push({ name: "North Dip Pole", lat: northPole.lat, lon: northPole.lon });
            const southPole = yield findPole(180, -1);
            if (southPole.val < -80)
                poles.push({ name: "South Dip Pole", lat: southPole.lat, lon: southPole.lon });
            return poles;
        });
    },
    DRAW_GRATICULES: function (clippedContainer, unclippedContainer, projection, pathGenerator) {
        const graticule = d3.geoGraticule();
        clippedContainer.append("path")
            .datum(graticule.step([15, 15]))
            .attr("d", pathGenerator)
            .style("fill", "none").style("stroke", "#ccc").style("stroke-width", 0.5).style("stroke-dasharray", "2,2");
        clippedContainer.append("path")
            .datum(graticule.step([30, 30]))
            .attr("d", pathGenerator)
            .style("fill", "none").style("stroke", "#aaa").style("stroke-width", 0.7);
        const graticuleGroup = unclippedContainer.append("g")
            .attr("class", "graticule-labels")
            .style("font-family", "sans-serif").style("font-size", "10px").style("fill", "#333");
        const bounds = pathGenerator.bounds({ type: "Sphere" });
        const left = bounds[0][0], top = bounds[0][1], right = bounds[1][0], bottom = bounds[1][1];
        for (let loc_lon = -180; loc_lon <= 180; loc_lon += 30) {
            const point = projection([loc_lon, 0]);
            if (point) {
                const label = loc_lon === 0 ? "0°" : loc_lon > 0 ? `${loc_lon}°E` : `${Math.abs(loc_lon)}°W`;
                graticuleGroup.append("text").attr("x", point[0]).attr("y", top - 8).text(label);
                graticuleGroup.append("text").attr("x", point[0]).attr("y", bottom + 15).text(label);
            }
        }
        for (let loc_lat = -90; loc_lat <= 90; loc_lat += 30) {
            if (loc_lat === 0)
                continue;
            const point = projection([0, loc_lat]);
            if (point) {
                const label = loc_lat > 0 ? `${loc_lat}°N` : `${Math.abs(loc_lat)}°S`;
                graticuleGroup.append("text").attr("x", left - 20).attr("y", point[1]).text(label);
                graticuleGroup.append("text").attr("x", right + 20).attr("y", point[1]).text(label);
            }
        }
        const equatorPoint = projection([0, 0]);
        if (equatorPoint) {
            graticuleGroup.append("text").attr("x", right + 20).attr("y", equatorPoint[1]).text("0°");
        }
        graticuleGroup.selectAll("text").style("text-anchor", "middle").attr("dy", ".35em");
    }
};
K_MAG_MAP_APP.init();
