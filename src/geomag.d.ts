// src/geomag.d.ts
// This file describes the shape of the existing CL_GEOMAG class from geomag.js

// Represents the components of the geomagnetic field at a given location and time
interface GEOMAG_FIELD_COMPONENTS {
    d_deg: number; // Declination in degrees
    i_deg: number; // Inclination in degrees
    h: number;     // Horizontal intensity
    x: number;     // North component
    y: number;     // East component
    z: number;     // Vertical component
    f: number;     // Total field intensity
}

declare class CL_GEOMAG {
    constructor();
    modelData: string[]; // Raw model data lines
    model: string[];     // Processed model data
    nmodel: number;      // Number of models loaded
    epoch: number[];     // Epoch years for each model
    minyr: number;       // Minimum year supported
    maxyr: number;       // Maximum year supported
    yrmin: number[];     // Minimum year for each model
    yrmax: number[];     // Maximum year for each model
    altmin: number[];    // Minimum altitude for each model
    altmax: number[];    // Maximum altitude for each model
    max1: number[];      // Model-specific parameter 1 (usage depends on implementation)
    max2: number[];      // Model-specific parameter 2 (usage depends on implementation)
    max3: number[];      // Model-specific parameter 3 (usage depends on implementation)
    irec_pos: number[];  // Record positions for model lookup

    /**
     * Computes geomagnetic field components for a given location and time.
     * @param par_epoch - Decimal year (e.g., 2020.5)
     * @param par_igdgc - Geodetic coordinate system flag
     * @param par_alt_Km - Altitude in kilometers
     * @param par_lat - Latitude in degrees
     * @param par_lon - Longitude in degrees
     * @returns GEOMAG_FIELD_COMPONENTS object with field values
     */
    getFieldComponents(par_epoch: number, par_igdgc: number, par_alt_Km: number, par_lat: number, par_lon: number): GEOMAG_FIELD_COMPONENTS;
}