// Removed module imports for d3/topojson; provide loose type aliases to avoid module context.
// import type { Topology } from 'topojson-specification';
// import { type FeatureCollection, type Geometry, type GeoJsonProperties } from 'geojson';
// Type aliases (loose) to keep TypeScript happy without turning file into a module.
// If stronger typing needed, reintroduce imports and add a bundler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Topology = any; // eslint-disable-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FeatureCollection = any; // eslint-disable-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Geometry = any; // eslint-disable-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeoJsonProperties = any; // eslint-disable-line @typescript-eslint/no-explicit-any

// --- Type Definitions ---
type FieldType = 'declination' | 'inclination' | 'totalfield';
type ParamKey = keyof GEOMAG_FIELD_COMPONENTS;

interface LegendItem {
    color: string;
    text: string;
}

interface ContourOptions {
    step: number;
    domain: [number, number];
    colorFunc: (d: number) => string;
    majorMultiplier: number;
    labelCondition: (v: number, s: number, m: number) => boolean;
}

interface FieldConfig {
    paramKey: ParamKey;
    title: string;
    legend: LegendItem[];
    positiveOptions: ContourOptions;
    negativeOptions: ContourOptions;
    zeroOptions: ContourOptions;
}

interface GridData {
    values: Float32Array;
    width: number;
    height: number;
}

interface DipPole {
    name: string;
    lat: number;
    lon: number;
    latAbs?: number;
    lonAbs?: number;
    val?: number;
}

interface CommonArgs {
    geomagInstance: CL_GEOMAG;
    epoch: number;
    altitudeKm: number;
}

// --- Marching Squares Helper Functions ---
function LERP(threshold: number, p1_val: number, p2_val: number): number {
    if (p2_val - p1_val === 0) return 0.5;
    return (threshold - p1_val) / (p2_val - p1_val);
}

function BIN_TO_TYPE(par_nw: boolean, par_ne: boolean, se: boolean, sw: boolean): number {
    let type = 0;
    if (par_nw) type |= 8;
    if (par_ne) type |= 4;
    if (se) type |= 2;
    if (sw) type |= 1;
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
        worldAtlasURL: '/data/countries-110m.json',
        cofURL: '/data/IGRF14.COF'
    },

    // --- Application State ---
    geomagInstance: null as CL_GEOMAG | null,
    cofFileContentCache: null as string | null,
    isSmoothingEnabled: true,
    isUncertaintyVisible: false,

    projection: null as d3.GeoProjection | null,
    clickInfoWindow: null as d3.Selection<HTMLDivElement, unknown, HTMLElement, any> | null,
    currentClickPoint: null as { x: number; y: number; lon: number; lat: number } | null,
    currentIsolines: null as d3.Selection<SVGGElement, unknown, HTMLElement, any> | null,

    // --- Main Initializer ---
    INIT: function() {
        document.addEventListener('DOMContentLoaded', () => {
            console.log("Initializing...");
            try {
                this.clickInfoWindow = d3.select("body").append("div")
                    .attr("class", "coordinate-info");

                this.SETUP_UI_LISTENERS();
                this.INIT_GEOMAG();
            } catch (error) {
                console.error("Initialization error:", error);
            }
        });
    },

    // --- UI and Event Handling ---
    UPD_UNCERTAINTY_BTN_STATE: function() {
        const fieldSelect = document.getElementById('fieldSelect') as HTMLSelectElement;
        const uncertaintyButton = document.getElementById('uncertaintyButton') as HTMLButtonElement;
        const field = fieldSelect.value as FieldType;

        if (field === 'totalfield') {
            uncertaintyButton.disabled = true;
            uncertaintyButton.setAttribute('aria-pressed', 'false');
            uncertaintyButton.style.cursor = 'not-allowed';
            uncertaintyButton.style.backgroundColor = '#ccc';
        } else {
            uncertaintyButton.disabled = false;
            uncertaintyButton.setAttribute('aria-pressed', String(this.isUncertaintyVisible));
            uncertaintyButton.style.cursor = 'pointer';
            uncertaintyButton.style.backgroundColor = '';
        }
    },

    SETUP_UI_LISTENERS: function() {
        const renderButton = document.getElementById('renderButton') as HTMLButtonElement;
        const fieldSelect = document.getElementById('fieldSelect') as HTMLSelectElement;
        const smoothingButton = document.getElementById('smoothingButton') as HTMLButtonElement;
        const uncertaintyButton = document.getElementById('uncertaintyButton') as HTMLButtonElement;

        renderButton.addEventListener('click', () => this.HANDLE_RENDER_CLICK());

        fieldSelect.addEventListener('change', () => {
            if (fieldSelect.value === 'totalfield') this.isUncertaintyVisible = false;
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

        document.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (this.clickInfoWindow && !target.closest('#geomag-map') && !target.closest('.coordinate-info')) {
                this.clickInfoWindow.style("display", "none");
            }
        });
    },

    UPD_STATUS: function(par_message: string, par_is_error = false): void {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = par_message;
            statusEl.style.color = par_is_error ? 'red' : '#555';
        }
    },

    INIT_GEOMAG: async function(): Promise<boolean> {
        if (typeof CL_GEOMAG === 'undefined') {
            this.UPD_STATUS('Error: CL_GEOMAG class not found.', true);
            return false;
        }
        this.geomagInstance = new CL_GEOMAG();
        try {
            if (!this.cofFileContentCache) {
                this.UPD_STATUS('Fetching .COF model file...');
                const response = await fetch(this.config.cofURL);
                if (!response.ok) throw new Error(`Failed to fetch COF file: ${response.statusText}`);
                this.cofFileContentCache = await response.text();
            }
            this.UPD_STATUS('Loading COF model data...');
            if (!this.LOAD_MODEL_INTO_INSTANCE(this.geomagInstance, this.cofFileContentCache)) {
                this.UPD_STATUS('Error: Failed to load model data.', true);
                return false;
            }
            this.UPD_STATUS(`Model loaded. Valid range: ${this.geomagInstance.minyr.toFixed(1)} - ${this.geomagInstance.maxyr.toFixed(1)}. Ready.`);
            await this.HANDLE_RENDER_CLICK();
            return true;
        } catch (error) {
            console.error('Initialization failed:', error);
            this.UPD_STATUS(`Error initializing: ${(error as Error).message}`, true);
            return false;
        }
    },

    CLR_OVERLAYS: function(): void {
        const svg = d3.select("#geomag-map");
    // Remove contour overlays, uncertainty zones, legend, map title, dip-pole markers and clipped group
    svg.selectAll(".contours-manual, .caution-zone, .unreliable-zone, .legend, text.map-title, text.dip-pole, #geomag-map-clipped-group").remove();
    // Also remove any temporary groups/titles/dip-poles created with suffixes
    svg.selectAll("[id^=geomag-map-clipped-group-], [class^=map-title-], [class^=dip-pole]").remove();
    // Remove clipPaths inside defs that may reference previous clipped groups
    svg.selectAll("defs clipPath").remove();
        this.CLR_CLICK_ELEMENTS();
    },

    SWAP_OVERLAYS: function(par_svg_id: string, suffix: string): void {
        const svg = d3.select<SVGSVGElement, unknown>(`#${par_svg_id}`);
        // Remove the main clipped group and title/dip-pole classes, then rename temp elements to main names
        const mainClippedId = `${par_svg_id}-clipped-group`;
        const tempClippedId = `${par_svg_id}-clipped-group${suffix}`;

        // Remove any existing main group
        svg.select(`#${mainClippedId}`).remove();
        // Rename temp group to main id
        svg.select(`#${tempClippedId}`).attr("id", mainClippedId);

    // Remove existing main title and dip-pole markers (support both text and group variants)
    svg.selectAll("g.map-title, text.map-title").remove();
    svg.selectAll("g.dip-pole, text.dip-pole").remove();

    // Rename temp title and dip-poles (if created with suffix). Support both g.* and text.* from older code
    svg.selectAll(`g.map-title${suffix}, text.map-title${suffix}`).attr("class", "map-title");
    svg.selectAll(`g.dip-pole${suffix}, text.dip-pole${suffix}`).attr("class", "dip-pole");

        // Remove temp clipPath (old ones) and keep only the suffix-less clipPath
        svg.selectAll("defs clipPath").each(function() {
            const node = d3.select(this as any);
            const id = node.attr("id") || "";
            if (id.endsWith(suffix)) {
                // rename to base id
                node.attr("id", id.replace(suffix, ""));
            } else {
                // remove other old clipPaths
                node.remove();
            }
        });

    // Remove any temporary legend groups (rename to base class)
    svg.selectAll(`g.legend${suffix ? suffix : ''}`).attr("class", "legend");
        // Clean up any other temp elements that start with suffix
        svg.selectAll(`[id$='${suffix}'], [class$='${suffix}']`).remove();
    },

    IS_POINT_IN_MAP: function(par_x: number, par_y: number): boolean {
        const svg = d3.select<SVGSVGElement, unknown>("#geomag-map");
        const width = +(svg.attr("width") || 0);
        const height = +(svg.attr("height") || 0);
        return par_x >= 0 && par_x <= width && par_y >= 0 && par_y <= height;
    },

    HANDLE_RENDER_CLICK: async function(): Promise<void> {
        const renderButton = document.getElementById('renderButton') as HTMLButtonElement;
        const epochInput = document.getElementById('epochInput') as HTMLInputElement;
        const altitudeInput = document.getElementById('altitudeInput') as HTMLInputElement;
        const gridStepInput = document.getElementById('gridStepInput') as HTMLInputElement;
        const fieldSelect = document.getElementById('fieldSelect') as HTMLSelectElement;

        try {
            renderButton.disabled = true;
            this.UPD_STATUS('Rendering...', false);

            if (!this.geomagInstance || this.geomagInstance.nmodel === 0) {
                this.UPD_STATUS('Initializing CL_GEOMAG model first...', false);
                const initialized = await this.INIT_GEOMAG();
                if (!initialized) return;
            }

            this.CLR_OVERLAYS();
            const currentEpoch = parseFloat(epochInput.value);
            const currentAltitude = parseFloat(altitudeInput.value);
            const gridStep = parseFloat(gridStepInput.value);
            const field = fieldSelect.value as FieldType;

            if (isNaN(currentEpoch) || isNaN(currentAltitude) || isNaN(gridStep) || gridStep <= 0) {
                this.UPD_STATUS('Error: Invalid input. All values must be positive numbers (steps > 0).', true);
                return;
            }

            this.config.gridResolutionLat = Math.floor(180 / gridStep) + 1;
            this.config.gridResolutionLon = Math.floor(360 / gridStep) + 1;

            this.UPD_STATUS(`Rendering ${field.charAt(0).toUpperCase() + field.slice(1)} for Epoch: ${currentEpoch.toFixed(2)}...`, false);

            await this.RENDER_GEOMAG_MAP('geomag-map', this.geomagInstance!, currentEpoch, currentAltitude, field);
            this.UPD_STATUS(`Map rendered for Epoch: ${currentEpoch.toFixed(2)}.`, false);

        } catch (error) {
            console.error('Failed to render map:', error);
            this.UPD_STATUS(`Error rendering map: ${(error as Error).message}`, true);
        } finally {
            renderButton.disabled = false;
        }
    },

    GET_FIELD_CONFIG: function(par_field: FieldType, par_current_epoch: number): FieldConfig {
        if (par_field === 'declination') {
            const STEP = 10;
            const COLOR_FUNC = (d: number) => d === 0 ? 'green' : (d > 0 ? '#C00000' : '#0000A0');
            const MAJOR_MULTIPLIER = 2;
            const LABEL_CONDITION = (v: number, s: number, m: number) => v === 0 || Math.abs(v) % (s * m) === 0;
            return {
                paramKey: 'd_deg',
                title: `Declination (D) degrees - Epoch ${par_current_epoch.toFixed(2)}`,
                legend: [
                    { color: "#C00000", text: "Declination East (+)" },
                    { color: "#0000A0", text: "Declination West (-)" },
                    { color: "green", text: "Zero Declination (Agonic)" }
                ],
                positiveOptions: { step: STEP, domain: [STEP, 180], colorFunc: COLOR_FUNC, majorMultiplier: MAJOR_MULTIPLIER, labelCondition: LABEL_CONDITION },
                negativeOptions: { step: STEP, domain: [-180, -STEP], colorFunc: COLOR_FUNC, majorMultiplier: MAJOR_MULTIPLIER, labelCondition: LABEL_CONDITION },
                zeroOptions: { step: 1, domain: [0, 0], colorFunc: COLOR_FUNC, majorMultiplier: 1, labelCondition: LABEL_CONDITION }
            };
        } else if (par_field === 'inclination') {
            const step = 10;
            const colorFunc = (d: number) => d === 0 ? 'green' : (d > 0 ? '#C00000' : '#0000A0');
            const majorMultiplier = 2;
            const labelCondition = (v: number, s: number, m: number) => v === 0 || Math.abs(v) % (s * m) === 0;
            return {
                paramKey: 'i_deg',
                title: `Inclination (I) degrees - Epoch ${par_current_epoch.toFixed(2)}`,
                legend: [
                    { color: "#C00000", text: "Inclination Down (+)" },
                    { color: "#0000A0", text: "Inclination Up (-)" },
                    { color: "green", text: "Zero Inclination (Equator)" }
                ],
                positiveOptions: { step, domain: [step, 90], colorFunc, majorMultiplier, labelCondition },
                negativeOptions: { step, domain: [-90, -step], colorFunc, majorMultiplier, labelCondition },
                zeroOptions: { step: 1, domain: [0, 0], colorFunc, majorMultiplier: 1, labelCondition }
            };
        } else { // totalfield
            const STEP = 2000;
            const COLOR_FUNC = () => '#A52A2A';
            const majorMultiplier = 5;
            const labelCondition = (v: number, s: number, m: number) => v % (s * m) === 0;
            return {
                paramKey: 'f',
                title: `Total Field (F) nT - Epoch ${par_current_epoch.toFixed(2)}`,
                legend: [ { color: "#A52A2A", text: "Total Intensity (F)" } ],
                positiveOptions: { step: STEP, domain: [20000, 66000], colorFunc: COLOR_FUNC, majorMultiplier, labelCondition },
                negativeOptions: { step: 0, domain: [0, -1], colorFunc: COLOR_FUNC, majorMultiplier, labelCondition },
                zeroOptions: { step: 0, domain: [0, -1], colorFunc: COLOR_FUNC, majorMultiplier, labelCondition }
            };
        }
    },

    RENDER_GEOMAG_MAP: async function(par_svg_id: string, par_geomag_instance: CL_GEOMAG, par_current_epoch: number, par_current_alt: number, par_field: FieldType): Promise<void> {
        // Do not clear overlays immediately: keep existing overlay visible
        // while we render a new temporary overlay, then swap to avoid flicker

        const WORLD = await d3.json<Topology>(this.config.worldAtlasURL);
        if (!WORLD || !WORLD.objects) {
            this.UPD_STATUS("Error: Invalid world atlas data.", true);
            return;
        }

        const LAND = topojson.feature(WORLD, (WORLD.objects as any).countries as any) as unknown as FeatureCollection;
        const SPHERE = { type: "Sphere" as const };
        const DIP_POLES = await this.CALCULATE_DIP_POLES();
        const COMMON_ARGS: CommonArgs = { geomagInstance: par_geomag_instance, epoch: par_current_epoch, altitudeKm: par_current_alt };
        const FIELD_CONFIG = this.GET_FIELD_CONFIG(par_field, par_current_epoch);

    const suffix = `-new-${Date.now()}`;
    const { pathGenerator, clippedGroup } = this.DRAW_BASE_MAP(par_svg_id, LAND, SPHERE, FIELD_CONFIG.title, DIP_POLES, suffix);
        const GRID_DATA = this.GENERATE_GRID_DATA(COMMON_ARGS, FIELD_CONFIG.paramKey);

        if (this.isSmoothingEnabled) this.APPLY_GAUSSIAN_BLUR(GRID_DATA.values, GRID_DATA.width, GRID_DATA.height, 1.5);

        const PASSES = [FIELD_CONFIG.positiveOptions, FIELD_CONFIG.negativeOptions, FIELD_CONFIG.zeroOptions];
        for (const options of PASSES) {
            if (options.domain[0] <= options.domain[1]) {
                this.DRAW_CONTOUR_LAYER(clippedGroup, pathGenerator, GRID_DATA, options);
            }
        }

    if (this.isUncertaintyVisible && (par_field === 'declination' || par_field === 'inclination')) {
            this.UPD_STATUS('Calculating blackout zones...', false);
            const hGridData = this.GENERATE_GRID_DATA(COMMON_ARGS, 'h');
            const paddedGrid = this.CREATE_PADDED_GRID(hGridData, 100000);
            this.DRAW_BLACKOUT_ZONES(clippedGroup, pathGenerator, paddedGrid);

            FIELD_CONFIG.legend.push({ color: "rgba(255, 165, 0, 0.4)", text: "Caution Zone (H < 6000 nT)" });
            FIELD_CONFIG.legend.push({ color: "rgba(255, 0, 0, 0.5)", text: "Unreliable Zone (H < 2000 nT)" });
        }

    this.ADD_LEGEND(par_svg_id, FIELD_CONFIG.legend, suffix);

    // Swap temp overlay into place and remove old overlay elements
    this.SWAP_OVERLAYS(par_svg_id, suffix);
    },

    DRAW_BASE_MAP: function (par_svg_id: string, par_land_features: FeatureCollection, par_sphere_feature: {
        type: "Sphere"
    }, title: string, dipPoles: DipPole[], suffix?: string) {
        const { mapWidth, mapHeight } = this.config;
        const svg = d3.select<SVGSVGElement, unknown>(`#${par_svg_id}`);

        this.projection = d3.geoMercator().fitSize([mapWidth - 40, mapHeight - 40], par_sphere_feature);
        const pathGenerator = d3.geoPath(this.projection);

        svg.on("click", null);

        svg.attr("width", mapWidth).attr("height", mapHeight)
           .attr("viewBox", [0, 0, mapWidth, mapHeight])
           .style("background-color", "#e0f3ff");

        const clipPathId = `${par_svg_id}-clip-path${suffix ? suffix : ''}`;
        const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");
        defs.select(`#${clipPathId}`).remove();
        const clip = defs.append("clipPath").attr("id", clipPathId);
        clip.append("rect").attr("x", 0).attr("y", 0).attr("width", mapWidth).attr("height", mapHeight);

        // Create a temp clipped group if suffix provided, otherwise replace main group
        const clippedGroupId = `${par_svg_id}-clipped-group${suffix ? suffix : ''}`;
        svg.select(`#${clippedGroupId}`).remove();
        const clippedGroup = svg.append("g")
            .attr("id", clippedGroupId)
            .attr("clip-path", `url(#${clipPathId})`);

        this.DRAW_GRATICULES(clippedGroup, svg, this.projection, pathGenerator);

        clippedGroup.append("path")
            .datum(par_land_features)
            .attr("d", pathGenerator)
            .style("fill", "black")
            .style("stroke", "#336633")
            .style("stroke-width", 0.5);

        // Optional outer border; safe to skip if projection returns invalid sphere path
        try {
            svg.append("path")
                .datum(par_sphere_feature)
                .attr("d", pathGenerator)
                .style("fill", "none")
                .style("stroke", "#333")
                .style("stroke-width", 1);
        } catch (_) { /* ignore */ }

    // Map title - add semi-transparent background for contrast and avoid stacking using suffix
    const titleGroup = svg.append("g").attr("class", `map-title${suffix ? suffix : ''}`)
        .attr("transform", `translate(${mapWidth/2}, 0)`)
        .style("pointer-events", "none");
    // background rectangle behind title for readability
    titleGroup.append("rect")
        .attr("x", -350).attr("y", 8)
        .attr("width", 700).attr("height", 28)
        .attr("rx", 6).attr("ry", 6)
        .style("fill", "rgba(255,255,255,0.85)")
        .style("stroke", "#ccc").style("stroke-width", 0.5);
    titleGroup.append("text")
        .attr("x", 0).attr("y", 28).attr("text-anchor", "middle")
        .style("font-size", "18px").style("font-family", "Arial, sans-serif").style("fill", "#222")
        .text(title);

        if (dipPoles) {
            // Render dip-poles as groups: marker + label offset for readability
            const poleGroups = svg.selectAll(`g.dip-pole${suffix ? suffix : ''}`).data(dipPoles).enter()
                .append("g").attr("class", `dip-pole${suffix ? suffix : ''}`)
                .style("pointer-events", "none");

            const self = this as any;
            poleGroups.each(function(this: SVGGElement, d: DipPole, i: number, nodes: SVGGElement[] | ArrayLike<SVGGElement>) {
                const p = self.projection!([d.lon, d.lat]);
                const g = d3.select(nodes[i]);
                if (!p || !isFinite(p[0]) || !isFinite(p[1])) return;
                g.attr("transform", `translate(${p[0]}, ${p[1]})`);
                // small star marker
                g.append("text")
                    .attr("x", 0).attr("y", 0).attr("text-anchor", "middle")
                    .style("font-size", "18px").style("fill", "#000")
                    .style("paint-order", "stroke").style("stroke", "white").style("stroke-width", "2px")
                    .text("✱");
                // label box + text to the right
                const labelX = 12; const labelY = -6;
                const labelText = `${d.name}${d.lat !== undefined ? ` ${d.lat.toFixed(1)}°, ${d.lon.toFixed(1)}°` : ''}`;
                const lbl = g.append("text")
                    .attr("x", labelX).attr("y", labelY)
                    .attr("text-anchor", "start")
                    .style("font-size", "12px").style("font-family", "Arial, sans-serif").style("fill", "#111")
                    .text(labelText);
                // create a subtle background rect behind label for contrast
                try {
                    const bbox = (lbl.node() as any).getBBox();
                    g.insert("rect", "text")
                        .attr("x", bbox.x - 4 + labelX).attr("y", bbox.y - 2 + labelY)
                        .attr("width", bbox.width + 8).attr("height", bbox.height + 4)
                        .attr("rx", 3).attr("ry", 3)
                        .style("fill", "rgba(255,255,255,0.85)")
                        .style("stroke", "#ddd").style("stroke-width", 0.5);
                } catch (_) { /* ignore if getBBox fails in some environments */ }
            });
        }

        svg.on("click", (event: MouseEvent) => {
            try {
                const [x, y] = d3.pointer(event);
                this.HANDLE_MAP_CLICK(x, y);
            } catch (error) {
                console.error("Error handling click event:", error);
            }
        });
        return { pathGenerator, clippedGroup };
    },

    HANDLE_MAP_CLICK: function(par_x: number, par_y: number): void {
        if (!this.projection) return;
        this.CLR_CLICK_ELEMENTS();
        if (!this.IS_POINT_IN_MAP(par_x, par_y)) return;
        try {
            const proj = this.projection;
            if (!proj || typeof proj.invert !== 'function') return;
            const coords = proj.invert([par_x, par_y]);
            if (!coords || coords.some(isNaN)) return;
            this.currentClickPoint = { x: par_x, y: par_y, lon: coords[0], lat: coords[1] };
            const fieldData = this.GET_POINT_FIELD(coords);
            if (!fieldData) return;
            this.SHOW_COORD_INFO(par_x, par_y, coords, fieldData);
            this.DRAW_ISOLINES_FROM_POINT(coords, fieldData);
        } catch (error) {
            console.error("Error handling map click:", error);
        }
    },

    CLR_CLICK_ELEMENTS: function(): void {
        this.clickInfoWindow?.style("display", "none");
        this.currentIsolines?.remove();
        this.currentIsolines = null;
    },

    GET_POINT_FIELD: function(par_coords: [number, number]): GEOMAG_FIELD_COMPONENTS | null {
        if (!this.geomagInstance) return null;

        const [lon, lat] = par_coords;
        const epochInput = document.getElementById('epochInput') as HTMLInputElement;
        const altitudeInput = document.getElementById('altitudeInput') as HTMLInputElement;
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

    SHOW_COORD_INFO: function(par_x: number, par_y: number, par_coords: [number, number], fieldData: GEOMAG_FIELD_COMPONENTS): void {
        const [lon, lat] = par_coords;
        const fieldSelect = document.getElementById('fieldSelect') as HTMLSelectElement;
        const field = fieldSelect.value as FieldType;

        let fieldValue: string, fieldName: string;
        if (field === 'declination') {
            fieldValue = fieldData.d_deg?.toFixed(2) + '°' || 'N/A';
            fieldName = 'Declination';
        } else if (field === 'inclination') {
            fieldValue = fieldData.i_deg?.toFixed(2) + '°' || 'N/A';
            fieldName = 'Inclination';
        } else {
            fieldValue = fieldData.f?.toFixed(0) + ' nT' || 'N/A';
            fieldName = 'Total Field';
        }

        const html = `
            <div><strong>Coordinates:</strong> ${lat.toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${lon.toFixed(2)}°${lon >= 0 ? 'E' : 'W'}</div>
            <div><strong>${fieldName}:</strong> ${fieldValue}</div>
            <div><strong>Horizontal (H):</strong> ${fieldData.h?.toFixed(0) || 'N/A'} nT</div>
            <div><strong>North (X):</strong> ${fieldData.x?.toFixed(0) || 'N/A'} nT</div>
            <div><strong>East (Y):</strong> ${fieldData.y?.toFixed(0) || 'N/A'} nT</div>
            <div><strong>Down (Z):</strong> ${fieldData.z?.toFixed(0) || 'N/A'} nT</div>
            <div class="close-btn">✕</div>
        `;

        if (this.clickInfoWindow) {
            this.clickInfoWindow.html(html)
                .style("left", `${par_x + 20}px`).style("top", `${par_y + 20}px`).style("display", "block");

            this.clickInfoWindow.select(".close-btn").on("click", () => this.CLR_CLICK_ELEMENTS());
        }
    },

    DRAW_ISOLINES_FROM_POINT: function(par_coords: [number, number], fieldData: GEOMAG_FIELD_COMPONENTS): void {
        if (!this.projection || !this.currentClickPoint) return;

        const svg = d3.select<SVGSVGElement, unknown>("#geomag-map");
        if (this.currentIsolines) this.currentIsolines.remove();

        const [lon, lat] = par_coords;
        const fieldSelect = document.getElementById('fieldSelect') as HTMLSelectElement;
        const field = fieldSelect.value as FieldType;
        const key = (field === 'declination' ? 'd_deg' : field === 'inclination' ? 'i_deg' : 'f') as keyof GEOMAG_FIELD_COMPONENTS;
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

    DRAW_CONTOUR_LAYER: function(par_container: d3.Selection<SVGGElement, unknown, HTMLElement, any>, par_path_generator: d3.GeoPath, par_grid_data: GridData, par_options: ContourOptions): void {
        const { step, domain, colorFunc, majorMultiplier, labelCondition } = par_options;
        const LEVELS = d3.range(domain[0], domain[1] + (step / 2), step);
    if (domain[0] === 0 && domain[1] === 0 && LEVELS.indexOf(0) === -1) LEVELS.push(0);
        if (LEVELS.length === 0) return;

        const CONTOUR_GROUP = par_container.append("g").attr("class", `contours-manual`);
        const toGeo = (p: {x: number, y: number}): [number, number] | null => {
            const lon = (p.x / (par_grid_data.width - 1)) * 360 - 180;
            const lat = 90 - (p.y / (par_grid_data.height - 1)) * 180;
            return isNaN(lon) || isNaN(lat) ? null : [lon, lat];
        };

        for (const LEVEL of LEVELS) {
            const lines: [{x:number, y:number}, {x:number, y:number}][] = [];
            for (let loc_y = 0; loc_y < par_grid_data.height - 1; loc_y++) {
                for (let loc_x = 0; loc_x < par_grid_data.width - 1; loc_x++) {
                    const NW_VAL = par_grid_data.values[loc_y * par_grid_data.width + loc_x];
                    const NE_VAL = par_grid_data.values[loc_y * par_grid_data.width + loc_x + 1];
                    const SW_VAL = par_grid_data.values[(loc_y + 1) * par_grid_data.width + loc_x];
                    const SE_VAL = par_grid_data.values[(loc_y + 1) * par_grid_data.width + loc_x + 1];
                    const TYPE = BIN_TO_TYPE(NW_VAL > LEVEL, NE_VAL > LEVEL, SE_VAL > LEVEL, SW_VAL > LEVEL);
                    if (TYPE === 0 || TYPE === 15) continue;

                    let loc_a, loc_b, loc_c, loc_d;
                    if (this.isSmoothingEnabled) {
                        loc_a = { x: loc_x + LERP(LEVEL, NW_VAL, NE_VAL), y: loc_y };
                        loc_b = { x: loc_x + 1, y: loc_y + LERP(LEVEL, NE_VAL, SE_VAL) };
                        loc_c = { x: loc_x + LERP(LEVEL, SW_VAL, SE_VAL), y: loc_y + 1 };
                        loc_d = { x: loc_x, y: loc_y + LERP(LEVEL, NW_VAL, SW_VAL) };
                    } else {
                        loc_a = { x: loc_x + 0.5, y: loc_y }; loc_b = { x: loc_x + 1, y: loc_y + 0.5 };
                        loc_c = { x: loc_x + 0.5, y: loc_y + 1 }; loc_d = { x: loc_x, y: loc_y + 0.5 };
                    }

                    switch (TYPE) {
                        case 1: case 14: lines.push([loc_d, loc_c]); break;
                        case 2: case 13: lines.push([loc_c, loc_b]); break;
                        case 3: case 12: lines.push([loc_d, loc_b]); break;
                        case 4: case 11: lines.push([loc_a, loc_b]); break;
                        case 5: lines.push([loc_d, loc_a]); lines.push([loc_c, loc_b]); break;
                        case 6: case 9:  lines.push([loc_a, loc_c]); break;
                        case 7: case 8:  lines.push([loc_d, loc_a]); break;
                        case 10: lines.push([loc_a, loc_d]); lines.push([loc_b, loc_c]); break;
                    }
                }
            }
            if (lines.length > 0) {
                const coords = lines.map(line => {
                    const start = toGeo(line[0]); const end = toGeo(line[1]);
                    return (!start || !end || Math.abs(start[0] - end[0]) > 180) ? null : [start, end];
                }).filter((d): d is [number, number][] => !!d);
                const GEOJSON = { type: "MultiLineString", coordinates: coords } as any;
                CONTOUR_GROUP.append("path").datum(GEOJSON).attr("d", par_path_generator as any)
                    .style("fill", "none").style("stroke", colorFunc(LEVEL))
                    .style("stroke-width", labelCondition(LEVEL, step, majorMultiplier) ? 2.0 : 1.0);
            }
        }
    },

    DRAW_BLACKOUT_ZONES: function(container: d3.Selection<SVGGElement, unknown, HTMLElement, any>, pathGenerator: d3.GeoPath, paddedGridData: GridData): void {
        const ZONES = [
            { threshold: 2000, color: "rgba(255, 0, 0, 0.5)", cls: "unreliable-zone" },
            { threshold: 6000, color: "rgba(255,165,0,0.4)", cls: "caution-zone" }
        ];
        const { values: paddedValues, width: paddedWidth, height: paddedHeight } = paddedGridData;
        const ORIGINAL_WIDTH = paddedWidth - 2;
        const ORIGINAL_HEIGHT = paddedHeight - 2;

        // Трансформация координат для d3.contours
        const GEO_TRANSFORM = (par_geometry: any): any => {
            const TRANSFORM_POINT = (point: [number, number]): [number, number] => {
                const lon = ((point[0] - 1) / (ORIGINAL_WIDTH - 1)) * 360 - 180;
                const lat = 90 - ((point[1] - 1) / (ORIGINAL_HEIGHT - 1)) * 180;
                return [lon, lat];
            };
            // d3.contours возвращает MultiPolygon с массивом полигонов
            const newCoordinates = par_geometry.coordinates.map((polygon: any) =>
                polygon.map((ring: any) => ring.map(TRANSFORM_POINT))
            );
            return { type: "MultiPolygon", coordinates: newCoordinates, value: par_geometry.value };
        };

        ZONES.forEach(zone => {
            const g = container.append("g").attr("class", zone.cls);
            // Получаем контуры для текущего порога
            const contours = d3.contours().size([paddedWidth, paddedHeight]).thresholds([zone.threshold]);
            const geometries = contours(Array.from(paddedValues)).map(GEO_TRANSFORM);
            // Рисуем только сами зоны неопределённости
            g.selectAll("path")
                .data(geometries)
                .enter()
                .append("path")
                .attr("d", pathGenerator as any)
                .style("fill", zone.color)
                .style("stroke", "none");
        });
    },

    APPLY_GAUSSIAN_BLUR: function(par_data: Float32Array, par_width: number, par_height: number, par_radius: number): void {
        const BLUR_KERNEL = this.CREATE_GAUSSIAN_BLUR_KERNEL(par_radius);
        const MID = Math.floor(BLUR_KERNEL.length / 2);
        const TEMP = new Float32Array(par_data.length);

        // Horizontal pass
        for (let loc_y = 0; loc_y < par_height; loc_y++) {
            for (let loc_x = 0; loc_x < par_width; loc_x++) {
                let loc_sum = 0;
                for (let loc_i = 0; loc_i < BLUR_KERNEL.length; loc_i++) {
                    let loc_col = loc_x + loc_i - MID;
                    if (loc_col < 0) loc_col = 0; if (loc_col >= par_width) loc_col = par_width - 1;
                    loc_sum += par_data[loc_y * par_width + loc_col] * BLUR_KERNEL[loc_i];
                }
                TEMP[loc_y * par_width + loc_x] = loc_sum;
            }
        }
        // Vertical pass
        for (let y = 0; y < par_height; y++) {
            for (let x = 0; x < par_width; x++) {
                let loc_sum = 0;
                for (let i = 0; i < BLUR_KERNEL.length; i++) {
                    let row = y + i - MID;
                    if (row < 0) row = 0; if (row >= par_height) row = par_height - 1;
                    loc_sum += TEMP[row * par_width + x] * BLUR_KERNEL[i];
                }
                par_data[y * par_width + x] = loc_sum;
            }
        }
    },

    CREATE_GAUSSIAN_BLUR_KERNEL: function(radius: number): number[] {
        const sigma = radius / 3; const size = Math.floor(radius * 2) + 1;
        const kernel = new Array(size); const sigma22 = 2 * sigma * sigma;
        const radiusInt = Math.floor(radius); let sum = 0;
        for (let loc_i = 0; loc_i < size; loc_i++) {
            const x = loc_i - radiusInt; const value = Math.exp(-(x * x) / sigma22);
            kernel[loc_i] = value; sum += value;
        }
        for (let loc_i = 0; loc_i < size; loc_i++) kernel[loc_i] /= sum;
        return kernel;
    },

    CREATE_PADDED_GRID: function(par_grid_data: GridData, par_padding_value: number): GridData {
        const { values, width, height } = par_grid_data;
        const paddedWidth = width + 2; const paddedHeight = height + 2;
        const paddedValues = new Float32Array(paddedWidth * paddedHeight);
        paddedValues.fill(par_padding_value);
        for (let loc_y = 0; loc_y < height; loc_y++) {
            for (let loc_x = 0; loc_x < width; loc_x++) {
                paddedValues[(loc_y + 1) * paddedWidth + (loc_x + 1)] = values[loc_y * width + loc_x];
            }
        }
        return { values: paddedValues, width: paddedWidth, height: paddedHeight };
    },

    ADD_LEGEND: function (par_svg_id: string, par_legend_items: LegendItem[], suffix?: string): void {
        const { mapHeight, mapWidth } = this.config;
        const svg = d3.select<SVGSVGElement, unknown>(`#${par_svg_id}`);
        svg.selectAll(`g.legend${suffix ? suffix : ''}`).remove();
        const legendGroup = svg.append("g").attr("class", `legend${suffix ? suffix : ''}`)
            .attr("transform", `translate(${mapWidth/2}, ${mapHeight - 30})`);
        const itemWidth = 150; const totalWidth = par_legend_items.length * itemWidth;
        const startX = -totalWidth / 2;
    par_legend_items.forEach((item, i) => {
            const legendItem = legendGroup.append("g").attr("transform", `translate(${startX + i * itemWidth}, 0)`);
            legendItem.append("rect").attr("x", 0).attr("y", 0).attr("width", 18).attr("height", 18)
                .style("fill", item.color).style("stroke", "black").style("stroke-width", 0.5);
            legendItem.append("text").attr("x", 24).attr("y", 9).attr("dy", "0.35em")
                .style("font-size", "11px").style("font-family", "Arial, sans-serif").text(item.text);
        });
    },

    LOAD_MODEL_INTO_INSTANCE: function (par_geomag_instance: CL_GEOMAG, par_cof_file_content: string): boolean {
        try {
            par_geomag_instance.modelData = par_cof_file_content.split(/\r?\n/); let loc_model_i = -1;
            par_geomag_instance.modelData.forEach((line, index) => {
                if (/^\s{3,}/.test(line)) {
                    loc_model_i++; if (loc_model_i >= 30) throw new Error("Too many models");
                    const parts = line.trim().split(/\s+/);
                    par_geomag_instance.model[loc_model_i] = parts[0] || '';
                    par_geomag_instance.epoch[loc_model_i] = parseFloat(parts[1]) || 0;
                    par_geomag_instance.max1[loc_model_i] = parseInt(parts[2]) || 0;
                    par_geomag_instance.max2[loc_model_i] = parseInt(parts[3]) || 0;
                    par_geomag_instance.max3[loc_model_i] = parseInt(parts[4]) || 0;
                    par_geomag_instance.yrmin[loc_model_i] = parseFloat(parts[5]) || 0;
                    par_geomag_instance.yrmax[loc_model_i] = parseFloat(parts[6]) || 0;
                    par_geomag_instance.altmin[loc_model_i] = parseFloat(parts[7]) || 0;
                    par_geomag_instance.altmax[loc_model_i] = parseFloat(parts[8]) || 0;
                    par_geomag_instance.irec_pos[loc_model_i] = index + 1;
                    if (loc_model_i === 0) {
                        par_geomag_instance.minyr = par_geomag_instance.yrmin[0];
                        par_geomag_instance.maxyr = par_geomag_instance.yrmax[0];
                    } else {
                        if (par_geomag_instance.yrmin[loc_model_i] < par_geomag_instance.minyr) par_geomag_instance.minyr = par_geomag_instance.yrmin[loc_model_i];
                        if (par_geomag_instance.yrmax[loc_model_i] > par_geomag_instance.maxyr) par_geomag_instance.maxyr = par_geomag_instance.yrmax[loc_model_i];
                    }
                }
            });
            par_geomag_instance.nmodel = loc_model_i + 1;
            return par_geomag_instance.nmodel > 0;
        } catch (e) {
            console.error("Error loading model data into CL_GEOMAG instance:", e);
            return false;
        }
    },

    GENERATE_GRID_DATA: function (par_common_args: CommonArgs, par_param_key: ParamKey): GridData {
        const { geomagInstance, epoch, altitudeKm } = par_common_args;
        const { igdgc, gridResolutionLat, gridResolutionLon } = this.config;
        const width = gridResolutionLon; const height = gridResolutionLat;
        const values = new Float32Array(width * height);
        const latAbsArr = d3.range(0, 180, 180 / (height - 1)).concat(180);
        const lonAbsArr = d3.range(0, 360, 360 / (width - 1)).concat(360);

        for (let loc_i = 0; loc_i < height; loc_i++) {
            for (let loc_j = 0; loc_j < width; loc_j++) {
                let loc_lat = 90 - latAbsArr[loc_i]; let lon = lonAbsArr[loc_j] - 180;
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
                const field = pointGeomag.getFieldComponents(epoch, igdgc, altitudeKm, loc_lat, lon);
                let loc_value = field[par_param_key];
                if (isNaN(loc_value)) loc_value = loc_j > 0 ? values[loc_i * width + (loc_j - 1)] : 0;
                values[loc_i * width + loc_j] = loc_value;
            }
        }
        return { values, width, height };
    },

    CALCULATE_DIP_POLES: async function (): Promise<DipPole[]> {
        const poles: DipPole[] = [];

        const FIND_POLE = async (par_start_lat: number, par_lat_dir: 1 | -1): Promise<DipPole> => {
            let loc_best_point: DipPole = { name: '', lat: par_start_lat, lon: 0, val: par_lat_dir * -Infinity };

            for (let loc_lat_abs = 0; loc_lat_abs <= 180; loc_lat_abs += 10) {
                let lat = 90 - loc_lat_abs;
                for (let loc_lon_Abs = 0; loc_lon_Abs < 360; loc_lon_Abs += 20) {
                    let loc_lon = loc_lon_Abs - 180;
                    const field = this.GET_POINT_FIELD([loc_lon, lat]);
                    if (field && !isNaN(field.i_deg) && (par_lat_dir * field.i_deg > par_lat_dir * loc_best_point.val!)) {
                        loc_best_point = { name:'', lat, latAbs: loc_lat_abs, lon: loc_lon, lonAbs: loc_lon_Abs, val: field.i_deg };
                    }
                }
            }

            let loc_search_radius = 5, searchStep = 1;
            for (let loc_i = 0; loc_i < 3; loc_i++) {
                for (let loc_lat_abs = Math.max(0, loc_best_point.latAbs! - loc_search_radius); loc_lat_abs <= Math.min(180, loc_best_point.latAbs! + loc_search_radius); loc_lat_abs += searchStep) {
                    let loc_lat = 90 - loc_lat_abs;
                    for (let loc_lon_abs = Math.max(0, loc_best_point.lonAbs! - loc_search_radius); loc_lon_abs <= Math.min(360, loc_best_point.lonAbs! + loc_search_radius); loc_lon_abs += searchStep) {
                        let loc_lon = loc_lon_abs - 180;  //#TODO
                        const field = this.GET_POINT_FIELD([loc_lon, loc_lat]);
                        if (field && !isNaN(field.i_deg) && (par_lat_dir * field.i_deg > par_lat_dir * loc_best_point.val!)) {
                            loc_best_point = { name:'', lat: loc_lat, latAbs: loc_lat_abs, lon: loc_lon, lonAbs: loc_lon_abs, val: field.i_deg };
                        }
                    }
                }
                loc_search_radius /= 2; searchStep /= 2;
            }
            return loc_best_point;
        };

        const northPole = await FIND_POLE(0, 1);
        if (northPole.val! > 80) poles.push({ name: "North Dip Pole", lat: northPole.lat, lon: northPole.lon });

        const southPole = await FIND_POLE(180, -1);
        if (southPole.val! < -80) poles.push({ name: "South Dip Pole", lat: southPole.lat, lon: southPole.lon });

        return poles;
    },

    DRAW_GRATICULES: function(par_clipped_container: d3.Selection<SVGGElement, unknown, HTMLElement, any>, par_unclipped_container: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>, par_projection: d3.GeoProjection, par_path_generator: d3.GeoPath): void {
        const graticule = d3.geoGraticule();

        par_clipped_container.append("path")
            .datum(graticule.step([15, 15]))
            .attr("d", par_path_generator)
            .style("fill", "none").style("stroke", "#ccc").style("stroke-width", 0.5).style("stroke-dasharray", "2,2");

        par_clipped_container.append("path")
            .datum(graticule.step([30, 30]))
            .attr("d", par_path_generator)
            .style("fill", "none").style("stroke", "#aaa").style("stroke-width", 0.7);

        const graticuleGroup = par_unclipped_container.append("g")
            .attr("class", "graticule-labels")
            .style("font-family", "sans-serif").style("font-size", "10px").style("fill", "#333");

        // Attempt to get bounds; Mercator of full sphere yields infinite y. Fallback to margins.
        let loc_left = 0, loc_top = 30, loc_right = this.config.mapWidth, loc_bottom = this.config.mapHeight - 30;
        try {
            const b = par_path_generator.bounds({ type: "Sphere" } as any);
            const candTop = b[0][1];
            const candBottom = b[1][1];
            if (isFinite(candTop) && isFinite(candBottom)) {
                loc_left = b[0][0];
                loc_right = b[1][0];
                loc_top = candTop + 10; // slight padding
                loc_bottom = candBottom - 10;
            }
        } catch (_) { /* ignore */ }

        // Longitude labels (top & bottom) - place just outside map box
        const topY = Math.max(12, loc_top - 10);
        const bottomY = Math.min(this.config.mapHeight - 6, loc_bottom + 14);
        for (let loc_lon = -180; loc_lon <= 180; loc_lon += 30) {
            const point = par_projection([loc_lon, 0]);
            if (point && isFinite(point[0])) {
                const label = loc_lon === 0 ? "0°" : loc_lon > 0 ? `${loc_lon}°E` : `${Math.abs(loc_lon)}°W`;
                graticuleGroup.append("text").attr("x", point[0]).attr("y", topY).text(label).attr("text-anchor", "middle");
                graticuleGroup.append("text").attr("x", point[0]).attr("y", bottomY).text(label).attr("text-anchor", "middle");
            }
        }

        // Latitude labels (sides) – skip the poles (±90°) to avoid Infinity in Mercator
        for (let loc_lat = -60; loc_lat <= 60; loc_lat += 30) { // now: -60, -30, 0, 30, 60
            if (loc_lat === 0) continue; // we label equator separately
            const point = par_projection([0, loc_lat]);
            if (point && isFinite(point[1])) {
                const label = loc_lat > 0 ? `${loc_lat}°N` : `${Math.abs(loc_lat)}°S`;
                // place left labels just outside left edge, right labels outside right edge
                const leftX = Math.max(6, loc_left - 8);
                const rightX = Math.min(this.config.mapWidth - 6, loc_right + 8);
                graticuleGroup.append("text").attr("x", leftX).attr("y", point[1]).text(label).attr("text-anchor", "start");
                graticuleGroup.append("text").attr("x", rightX).attr("y", point[1]).text(label).attr("text-anchor", "end");
            }
        }

        // Equator label (right side) if projection returns finite point
        const equatorPoint = par_projection([0, 0]);
        if (equatorPoint && isFinite(equatorPoint[1])) {
            graticuleGroup.append("text").attr("x", loc_right - 15).attr("y", equatorPoint[1]).text("0°").attr("text-anchor", "end");
        }

        graticuleGroup.selectAll("text").attr("dy", ".35em");
    }
};

K_MAG_MAP_APP.INIT();

