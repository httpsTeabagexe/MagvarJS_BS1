# Kanban Board

## Backlog

### MAGVAR
- Definition: Variation is the angle between magnetic and geographic meridians at any point, expressed in degrees and minutes east or west to indicate the direction of magnetic north relative to true north.
- Objective: Create a grid table with calculated magnetic declination values for specific input data.

#### Main Objective
- Display IGRF14 data on a 3D Earth model built to WGS-84 standard.

#### Implementation Steps
- 3D Earth model with magnetic declination visualization
- Parsing coefficients from IGRF-14 file for model construction
- Add parameters for vector calculation (date, altitude, etc.)
- Use IGRF-14 coefficients to calculate D, I, and F vector using spherical harmonics
- Validate calculated data with certified software
- Display 3D Earth model (WGS-84 ellipsoid)
- Calculate magnetic declination at user-specified point
- Visualize magnetic declination (isolines for F, D, I, H vector)
- User interface: input fields for coordinates, date, altitude, data source selection, dynamic scale, overlay mode, isoline options, timeline (optional)
- Optimization: calculate and display declination between two points

---

## In Progress

### Current Tasks (as of 22.09)
- Implement zooming in/out on map with dynamic scale and isoline rendering at smaller scales (for map and 3D model)
- Fix Dip Poles display and recalculate when sphere position changes (for 3D model)
- Improve map interaction handling (smooth zoom, dragging map and Earth sphere)
- Add coordinate search bar with parameter input
- Add ability to enter date in traditional format in addition to decimal format

---

## Ready

### Completed Tasks
- Parse coefficients from IGRF-14 file for model construction
- Add parameters for vector calculation (date, altitude, etc.)
- Use IGRF-14 coefficients to calculate D, I, and F vector using spherical harmonics
- Validate calculated data with certified software
- Render 2D map and isoline overlay (see 2.4.1-2.4.3)
- Add correct calculation and display of magnetic poles
- Add numeric values for isolines (isogons)
- Add ability to change isoline step
- Add latitude/longitude labels
- Fix Declination display on map
- Improve user experience
- Add zooming with dynamic scale and isoline rendering at smaller scales
- Fix Dip Poles display
- Add value labels for significant isolines (e.g., every 5 nT or 5°)
- Add grid step resolution (down to tenths of a degree, optimize rendering speed)
- Calculate and visualize uncertainty zones
- Calculate at point by clicking on map

---

## In Review

### Tasks Pending Verification
- Review isoline overlay implementation for accuracy
- Validate uncertainty zone calculations
- Confirm user experience improvements

---

## Notes
- See TODO.md for historical context and details.
- Refer to IGRF14 documentation for isoline implementation reference.
