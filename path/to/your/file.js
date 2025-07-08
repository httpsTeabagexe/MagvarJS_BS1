// Generates a grid of geomagnetic field data for visualization or analysis.
// Computes the specified field parameter at each grid point using the provided geomagnetic model.
function generateGridData(commonArgs, paramKey) {
    // Destructure required arguments from the input object.
    const { geomagInstance, epoch, altitudeKm } = commonArgs;
    // Extract grid and coordinate system configuration from the application config.
    const { igdgc, gridResolutionLat, gridResolutionLon } = MagMapApp.config;

    // --- FIX: Direct, high-resolution grid calculation ---
    // The previous implementation used a coarse grid and bilinear interpolation,
    // which created artifacts in areas of high gradient (like the poles).
    // This new implementation calculates the value for every point on the final grid.
    // It is more computationally expensive but produces a much more accurate result.

    // Set grid dimensions: width (longitude), height (latitude).
    // const width = gridResolutionLon + 1;
    const width = gridResolutionLon;
    const height = gridResolutionLat;
    // Pre-allocate a typed array to store computed field values for each grid cell.
    const values = new Float32Array(width * height);

    // Generate latitude values from 90°N to -90°S, evenly spaced.
    const lats = d3.range(90, -90 - 1e-9, -180 / (height - 1));
    // Alternative latitude and longitude generation (commented out).
    // const lats = d3.range(90, -90 - 1e-9, 180 / (height));
    // const lons = d3.range(-180, 180 - 1e-9, 360 / (width));
    // Generate longitude values from 180°E to -180°W, evenly spaced.
    const lons = d3.range(180, -180 - 1e-9, -360 / (width - 1));

    // Loop over each latitude and longitude grid point.
    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            // Instantiate a new Geomag object for each point to ensure no state is carried over.
            // This is slow but safe, mimicking the original's approach on its coarse grid.
            const pointGeomag = new Geomag();
            // Copy all relevant model data and parameters from the provided geomagInstance.
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

            // Compute the geomagnetic field components at the current grid point.
            const field = pointGeomag.getFieldComponents(epoch, igdgc, altitudeKm, lats[i], lons[j]);
            // Store the requested field parameter value in the output array.
            values[i * width + j] = field[paramKey];
        }
    }

    // Return the computed grid values and dimensions.
    return { values, width, height };
}

