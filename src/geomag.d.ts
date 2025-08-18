// src/geomag.d.ts
// This file describes the shape of the existing CL_GEOMAG class from geomag.js

interface GeomagFieldComponents {
    d_deg: number;
    i_deg: number;
    h: number;
    x: number;
    y: number;
    z: number;
    f: number;
}

declare class CL_GEOMAG {
    constructor();
    modelData: string[];
    model: string[];
    nmodel: number;
    epoch: number[];
    minyr: number;
    maxyr: number;
    yrmin: number[];
    yrmax: number[];
    altmin: number[];
    altmax: number[];
    max1: number[];
    max2: number[];
    max3: number[];
    irec_pos: number[];

    getFieldComponents(par_epoch: number, par_igdgc: number, par_alt_Km: number, par_lat: number, par_lon: number): GeomagFieldComponents;
}