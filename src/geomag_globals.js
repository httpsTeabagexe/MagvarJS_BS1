// src/geomag_globals.js
// Global constants and variables for geomag.js and related modules

// Conversion factors
export const GL_FT_TO_KM = 1.0 / 0.0003048; // Feet to kilometers
export const GL_RAD_TO_DEG = 180.0 / Math.PI; // Radians to degrees
export const GL_DEG_TO_RAD = Math.PI / 180.0; // Degrees to radians

// WGS84 ellipsoid constants
export const GL_EARTH_RADIUS = 6371.2; // Mean Earth radius in kilometers
export const GL_A_SQUARED = 40680631.59; // Semi-major axis squared (a^2)
export const GL_B_SQUARED = 40408299.98; // Semi-minor axis squared (b^2)

// Model limits
export const GL_MAX_MOD = 30; // Maximum number of models
export const GL_MAX_DEG = 13; // Maximum degree
export const GL_MAX_COEFF = GL_MAX_DEG * (GL_MAX_DEG + 2) + 1; // +1 for 1-based indexing
