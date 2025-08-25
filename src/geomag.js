/****************************************************************************/
    /*                                                                          */
    /*      NGDC's Geomagnetic Field Modeling software for the IGRF and WMM     */
    /*      Translated to JavaScript by an AI assistant for Node.js execution.  */
    /*      (Version 3: Refactored control flow and improved user experience)   */
    /*                                                                          */
    /****************************************************************************/
    /*      Original C Version 7.0 by Stefan Maus, Jan-25-2010                  */
    /****************************************************************************/

    // Remove Node.js requires for browser
    // const fs = require('fs');
    // const prompt = require('prompt-sync')({ sigint: true });

    // Import global constants
    import { GL_FT_TO_KM, GL_RAD_TO_DEG, GL_DEG_TO_RAD, GL_MAX_MOD, GL_MAX_DEG, GL_MAX_COEFF, GL_EARTH_RADIUS, GL_A_SQUARED, GL_B_SQUARED } from './geomag_globals.js';

    /**
     * Класс для инкапсуляции состояния и логики геомагнитной модели.
     */
    class CL_GEOMAG {
        constructor() {
            // Spherical harmonic coefficients for the main field (epoch)
            this.gh1 = new Array(GL_MAX_COEFF).fill(0);
            // Spherical harmonic coefficients for secular variation (annual change)
            this.gh2 = new Array(GL_MAX_COEFF).fill(0);
            // Temporary arrays for interpolated/extrapolated coefficients
            this.gha = new Array(GL_MAX_COEFF).fill(0);
            this.ghb = new Array(GL_MAX_COEFF).fill(0);
            // Field elements (declination, total intensity, horizontal intensity, inclination)
            this.d = 0;   // Declination (radians)
            this.f = 0;   // Total field intensity (nT)
            this.h = 0;   // Horizontal intensity (nT)
            this.i = 0;   // Inclination (radians)
            // Temporary field elements for secular variation calculations
            this.dtemp = 1; this.ftemp = 0; this.htemp = 0; this.itemp = 0;
            // Field vector components (nT)
            this.x = 0; this.y = 0; this.z = 0;
            // Temporary field vector components for secular variation
            this.xtemp = 0; this.ytemp = 0; this.ztemp = 0;
            // Model metadata arrays (per model)
            this.epoch = new Array(GL_MAX_MOD).fill(0);   // Model epoch years
            this.yrmin = new Array(GL_MAX_MOD).fill(0);   // Minimum valid year per model
            this.yrmax = new Array(GL_MAX_MOD).fill(0);   // Maximum valid year per model
            this.altmin = new Array(GL_MAX_MOD).fill(0);  // Minimum altitude per model (km)
            this.altmax = new Array(GL_MAX_MOD).fill(0);  // Maximum altitude per model (km)
            this.max1 = new Array(GL_MAX_MOD).fill(0);    // Maximum degree/order for main field
            this.max2 = new Array(GL_MAX_MOD).fill(0);    // Maximum degree/order for secular variation
            this.max3 = new Array(GL_MAX_MOD).fill(0);    // Reserved/unused or model-specific
            this.model = Array.from({ length: GL_MAX_MOD }, () => ""); // Model names
            this.irec_pos = new Array(GL_MAX_MOD).fill(0); // Record positions for model lookup
            // Model data and file info
            this.modelData = null; // Array of lines from the model file
            this.nmodel = 0;       // Number of models loaded
            this.minyr = 0;        // Earliest year supported by any model
            this.maxyr = 0;        // Latest year supported by any model
            this.mdfile = "";      // Model file name
        }

        /**
         * Convert month, day, year to decimal year (fractional).
         */
        julday(par_month, par_day, par_year) {
            const DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
            const LEAP_YEAR = (((par_year % 4) === 0) && (((par_year % 100) !== 0) || ((par_year % 400) === 0)));
            const day_in_year = (DAYS[par_month - 1] + par_day + (par_month > 2 && LEAP_YEAR ? 1 : 0));
            return par_year + (day_in_year / (365.0 + (LEAP_YEAR ? 1 : 0)));
        }

        /**
         * Load and parse model file headers to extract model parameters.
         * Optimized for compatibility: detects headers by 3+ leading spaces, parses as many fields as present, defaults missing to zero.
         */
        loadModelFile(par_mdfile) {
            try {
                this.mdfile = par_mdfile;
                const fileContent = fs.readFileSync(this.mdfile, 'utf8');
                this.modelData = fileContent.split(/\r?\n/);
            } catch (e) {
                console.log(`\nError opening file ${par_mdfile}.`);
                return false;
            }

            let loc_model_i = -1;
            this.modelData.forEach((line, index) => {
                // Match C logic: header line starts with at least 3 spaces
                if (/^\s{3,}/.test(line)) {
                    loc_model_i++;
                    if (loc_model_i >= GL_MAX_MOD) {
                        console.log(`Too many models in file ${this.mdfile} on line ${index + 1}.`);
                        process.exit(6);
                    }
                    const parts = line.trim().split(/\s+/);
                    // Parse as many fields as present, defaulting missing to zero
                    this.model[loc_model_i] = parts[0] || '';
                    this.epoch[loc_model_i] = parseFloat(parts[1]) || 0;
                    this.max1[loc_model_i] = parseInt(parts[2]) || 0;
                    this.max2[loc_model_i] = parseInt(parts[3]) || 0;
                    this.max3[loc_model_i] = parseInt(parts[4]) || 0;
                    this.yrmin[loc_model_i] = parseFloat(parts[5]) || 0;
                    this.yrmax[loc_model_i] = parseFloat(parts[6]) || 0;
                    this.altmin[loc_model_i] = parseFloat(parts[7]) || 0;
                    this.altmax[loc_model_i] = parseFloat(parts[8]) || 0;
                    this.irec_pos[loc_model_i] = index + 1;
                    if (loc_model_i === 0) {
                        this.minyr = this.yrmin[0];
                        this.maxyr = this.yrmax[0];
                    } else {
                        if (this.yrmin[loc_model_i] < this.minyr) this.minyr = this.yrmin[loc_model_i];
                        if (this.yrmax[loc_model_i] > this.maxyr) this.maxyr = this.yrmax[loc_model_i];
                    }
                }
            });
            this.nmodel = loc_model_i + 1;
            if (this.nmodel === 0) {
                console.log(`No valid model data found in ${par_mdfile}.`);
                return false;
            }
            return true;
        }

        /**
         * Read spherical harmonic coefficients from the model data.
         */
        getshc(par_iflag, par_strec, par_nmax_of_gh, par_gh) {
            let loc_line_num = par_strec;
            let loc_ii = 0;

            for (let loc_nn = 1; loc_nn <= par_nmax_of_gh; loc_nn++) {
                for (let mm = 0; mm <= loc_nn; mm++) {
                    const line = this.modelData[loc_line_num];
                    if (!line) {
                        console.log(`Error: Unexpected end of file while reading coefficients.`);
                        process.exit(1);
                    }
                    let loc_parts = line.trim().split(/\s+/);

                    // Если строка начинается с 'g' или 'h' (формат IGRF), удаляем этот элемент
                    if (loc_parts[0] === 'g' || loc_parts[0] === 'h') {
                        loc_parts.shift();
                    }

                    const n = parseInt(loc_parts[0]);
                    const m = parseInt(loc_parts[1]);
                    // iflag=1 читает основное поле, iflag=0 - вековую вариацию
                    const g = parseFloat(loc_parts[par_iflag === 1 ? 2 : 4]);
                    const hh = parseFloat(loc_parts[par_iflag === 1 ? 3 : 5]);

                    if (loc_nn !== n || mm !== m) {
                        console.log(`Error: Corrupt record in model file at line ${loc_line_num + 1}. Expected n=${loc_nn}, m=${mm} but got n=${n}, m=${m}.`);
                        console.log(`Line content: "${line}"`);
                        process.exit(5);
                    }

                    loc_ii++;
                    if (par_gh === 1) this.gh1[loc_ii] = g;
                    else this.gh2[loc_ii] = g;

                    if (m !== 0) {
                        loc_ii++;
                        if (par_gh === 1) this.gh1[loc_ii] = hh;
                        else this.gh2[loc_ii] = hh;
                    }
                    loc_line_num++;
                }
            }
        }

        /**
         * Extrapolate spherical harmonic coefficients based on secular variation for a given par_date.
         */
        extrapsh(par_date, par_dte1, par_nmax1, par_nmax2, par_gh) {
            let loc_nmax;
            let loc_k, loc_l;
            const factor = par_date - par_dte1;

            if (par_nmax1 === par_nmax2) {
                loc_k = par_nmax1 * (par_nmax1 + 2);
                loc_nmax = par_nmax1;
            } else {
                if (par_nmax1 > par_nmax2) {
                    loc_k = par_nmax2 * (par_nmax2 + 2);
                    loc_l = par_nmax1 * (par_nmax1 + 2);
                    const target = (par_gh === 3) ? this.gha : this.ghb;
                    for (let loc_ii = loc_k + 1; loc_ii <= loc_l; ++loc_ii) {
                        target[loc_ii] = this.gh1[loc_ii];
                    }
                    loc_nmax = par_nmax1;
                } else {
                    loc_k = par_nmax1 * (par_nmax1 + 2);
                    loc_l = par_nmax2 * (par_nmax2 + 2);
                    const target = (par_gh === 3) ? this.gha : this.ghb;
                    for (let loc_ii = loc_k + 1; loc_ii <= loc_l; ++loc_ii) {
                        target[loc_ii] = factor * this.gh2[loc_ii];
                    }
                    loc_nmax = par_nmax2;
                }
            }

            const target = (par_gh === 3) ? this.gha : this.ghb;
            for (let loc_ii = 1; loc_ii <= loc_k; ++loc_ii) {
                target[loc_ii] = this.gh1[loc_ii] + factor * this.gh2[loc_ii];
            }
            return loc_nmax;
        }

        /**
         * Interpolate spherical harmonic coefficients between two model epochs.
         */
        interpsh(par_date, par_dte1, par_nmax1, par_dte2, par_nmax2, par_gh) {
            let loc_nmax;
            let loc_k, loc_l;
            const factor = (par_date - par_dte1) / (par_dte2 - par_dte1);

            if (par_nmax1 === par_nmax2) {
                loc_k = par_nmax1 * (par_nmax1 + 2);
                loc_nmax = par_nmax1;
            } else {
                if (par_nmax1 > par_nmax2) {
                    loc_k = par_nmax2 * (par_nmax2 + 2);
                    loc_l = par_nmax1 * (par_nmax1 + 2);
                    const target = (par_gh === 3) ? this.gha : this.ghb;
                    for (let ii = loc_k + 1; ii <= loc_l; ++ii) {
                        target[ii] = this.gh1[ii] + factor * (-this.gh1[ii]);
                    }
                    loc_nmax = par_nmax1;
                } else {
                    loc_k = par_nmax1 * (par_nmax1 + 2);
                    loc_l = par_nmax2 * (par_nmax2 + 2);
                    const target = (par_gh === 3) ? this.gha : this.ghb;
                    for (let ii = loc_k + 1; ii <= loc_l; ++ii) {
                        target[ii] = factor * this.gh2[ii];
                    }
                    loc_nmax = par_nmax2;
                }
            }

            const target = (par_gh === 3) ? this.gha : this.ghb;
            for (let loc_ii = 1; loc_ii <= loc_k; ++loc_ii) {
                target[loc_ii] = this.gh1[loc_ii] + factor * (this.gh2[loc_ii] - this.gh1[loc_ii]);
            }
            return loc_nmax;
        }

        /**
         * Compute geomagnetic field vector components (X, Y, Z) using spherical harmonics.
         */
        /**
         * Computes field components from a spherical harmonic model. This is a core
         * routine for geomagnetic field models.
         * @param {number} par_igdgc - Flag for geodetic (1) or geocentric (2) coordinates.
         * @param {number} par_f_lat - Latitude in degrees.
         * @param {number} par_f_lon - Longitude in degrees.
         * @param {number} par_elev - Elevation in kilometers.
         * @param {number} par_nmax - Maximum degree of the spherical harmonic model.
         * @param {Array<number>} par_gh - Schmidt quasi-normalized spherical harmonic coefficients.
         */
        sh_val_3(par_igdgc, par_f_lat, par_f_lon, par_elev, par_nmax, par_gh) {
            // Browser-compatible: constants imported at top; removed CommonJS require.

            // Sine and cosine arrays for longitude multiples (used in spherical harmonics).
            // The size 14 accommodates models up to order M=13.
            const K_SIN_LONG = new Array(14).fill(0); // Stores sin(m * longitude)
            const K_COS_LONG = new Array(14).fill(0); // Stores cos(m * longitude)

            // Arrays for Associated Legendre Polynomials and their derivatives.
            // The size 119 is sufficient for models up to degree N=13.
            const K_P = new Array(119).fill(0); // Legendre polynomials, P(n,m)
            const K_Q = new Array(119).fill(0); // Derivatives of Legendre polynomials, dP(n,m)/d(theta)

            // Radial distance from the center of the Earth. Initialized with elevation;
            // the Earth's radius is likely added later based on the coordinate system.
            let loc_r = par_elev;

            // Calculate sine and cosine of the latitude, converting degrees to radians.
            let loc_s_lat = Math.sin(par_f_lat * GL_DEG_TO_RAD);
            let loc_c_lat;

            // Avoid numerical instability at the poles.
            // If the latitude is very close to +/- 90 degrees, use a value
            // slightly off the pole to prevent issues with trigonometric functions.
            if (Math.abs(90.0 - par_f_lat) < 0.001) { // Near North Pole
                loc_c_lat = Math.cos(89.999 * GL_DEG_TO_RAD);
            } else if (Math.abs(90.0 + par_f_lat) < 0.001) { // Near South Pole
                loc_c_lat = Math.cos(-89.999 * GL_DEG_TO_RAD);
            } else { // Standard case
                loc_c_lat = Math.cos(par_f_lat * GL_DEG_TO_RAD);
            }

            // Pre-calculate sine and cosine for the base longitude (m=1).
            // These are used to efficiently compute values for higher orders (m>1)
            // using trigonometric recurrence relations.
            K_SIN_LONG[1] = Math.sin(par_f_lon * GL_DEG_TO_RAD);
            K_COS_LONG[1] = Math.cos(par_f_lon * GL_DEG_TO_RAD);


            if (par_gh === 3) {
                this.x = 0; this.y = 0; this.z = 0;
            } else {
                this.xtemp = 0; this.ytemp = 0; this.ztemp = 0;
            }

            let loc_sd = 0.0;
            let loc_cd = 1.0;
            let loc_l = 1;
            let loc_n = 0;
            let loc_m = 1;
            const npq = (par_nmax * (par_nmax + 3)) / 2;

            if (par_igdgc === 1) {
                const aa_gd = GL_A_SQUARED * loc_c_lat * loc_c_lat;
                const bb_gd = GL_B_SQUARED * loc_s_lat * loc_s_lat;
                const cc_gd = aa_gd + bb_gd;
                const dd_gd = Math.sqrt(cc_gd);
                loc_r = Math.sqrt(par_elev * (par_elev + 2.0 * dd_gd) + (GL_A_SQUARED * aa_gd + GL_B_SQUARED * bb_gd) / cc_gd);
                loc_cd = (par_elev + dd_gd) / loc_r;
                loc_sd = (GL_A_SQUARED - GL_B_SQUARED) / dd_gd * loc_s_lat * loc_c_lat / loc_r;
                const aa_slat = loc_s_lat;
                loc_s_lat = loc_s_lat * loc_cd - loc_c_lat * loc_sd;
                loc_c_lat = loc_c_lat * loc_cd + aa_slat * loc_sd;
            }

            const ratio = GL_EARTH_RADIUS / loc_r;
            const aa = Math.sqrt(3.0);
            K_P[1] = 2.0 * loc_s_lat;
            K_P[2] = 2.0 * loc_c_lat;
            K_P[3] = 4.5 * loc_s_lat * loc_s_lat - 1.5;
            K_P[4] = 3.0 * aa * loc_c_lat * loc_s_lat;
            K_Q[1] = -loc_c_lat;
            K_Q[2] = loc_s_lat;
            K_Q[3] = -3.0 * loc_c_lat * loc_s_lat;
            K_Q[4] = aa * (loc_s_lat * loc_s_lat - loc_c_lat * loc_c_lat);

            const gh_arr = (par_gh === 3) ? this.gha : this.ghb;
            let loc_fn = 0;

            for (let loc_k = 1; loc_k <= npq; ++loc_k) {
                if (loc_n < loc_m) {
                    loc_m = 0;
                    loc_n++;
                    loc_fn = loc_n;
                }
                const rr = Math.pow(ratio, loc_n + 2);
                const fm = loc_m;

                if (loc_k >= 5) {
                    if (loc_m === loc_n) {
                        const aa_p = Math.sqrt(1.0 - 0.5 / fm);
                        const j = loc_k - loc_n - 1;
                        K_P[loc_k] = (1.0 + 1.0 / fm) * aa_p * loc_c_lat * K_P[j];
                        K_Q[loc_k] = aa_p * (loc_c_lat * K_Q[j] + loc_s_lat / fm * K_P[j]);
                        K_SIN_LONG[loc_m] = K_SIN_LONG[loc_m - 1] * K_COS_LONG[1] + K_COS_LONG[loc_m - 1] * K_SIN_LONG[1];
                        K_COS_LONG[loc_m] = K_COS_LONG[loc_m - 1] * K_COS_LONG[1] - K_SIN_LONG[loc_m - 1] * K_SIN_LONG[1];
                    } else {
                        const aa_p = Math.sqrt(loc_fn * loc_fn - fm * fm);
                        const bb_p = Math.sqrt(((loc_fn - 1.0) * (loc_fn - 1.0)) - (fm * fm)) / aa_p;
                        const cc_p = (2.0 * loc_fn - 1.0) / aa_p;
                        const ii = loc_k - loc_n;
                        const j = loc_k - 2 * loc_n + 1;
                        K_P[loc_k] = (loc_fn + 1.0) * (cc_p * loc_s_lat / loc_fn * K_P[ii] - bb_p / (loc_fn - 1.0) * K_P[j]);
                        K_Q[loc_k] = cc_p * (loc_s_lat * K_Q[ii] - loc_c_lat / loc_fn * K_P[ii]) - bb_p * K_Q[j];
                    }
                }

                const aa_sh = rr * gh_arr[loc_l];

                if (loc_m === 0) {
                    if (par_gh === 3) {
                        this.x += aa_sh * K_Q[loc_k];
                        this.z -= aa_sh * K_P[loc_k];
                    } else {
                        this.xtemp += aa_sh * K_Q[loc_k];
                        this.ztemp -= aa_sh * K_P[loc_k];
                    }
                    loc_l++;
                } else {
                    const bb_sh = rr * gh_arr[loc_l + 1];
                    const cc_sh = aa_sh * K_COS_LONG[loc_m] + bb_sh * K_SIN_LONG[loc_m];

                    if (par_gh === 3) {
                        this.x += cc_sh * K_Q[loc_k];
                        this.z -= cc_sh * K_P[loc_k];
                        if (loc_c_lat > 0) {
                            this.y += (aa_sh * K_SIN_LONG[loc_m] - bb_sh * K_COS_LONG[loc_m]) * fm * K_P[loc_k] / ((loc_fn + 1.0) * loc_c_lat);
                        } else {
                            this.y += (aa_sh * K_SIN_LONG[loc_m] - bb_sh * K_COS_LONG[loc_m]) * K_Q[loc_k] * loc_s_lat;
                        }
                    } else {
                        this.xtemp += cc_sh * K_Q[loc_k];
                        this.ztemp -= cc_sh * K_P[loc_k];
                        if (loc_c_lat > 0) {
                            this.ytemp += (aa_sh * K_SIN_LONG[loc_m] - bb_sh * K_COS_LONG[loc_m]) * fm * K_P[loc_k] / ((loc_fn + 1.0) * loc_c_lat);
                        } else {
                            this.ytemp += (aa_sh * K_SIN_LONG[loc_m] - bb_sh * K_COS_LONG[loc_m]) * K_Q[loc_k] * loc_s_lat;
                        }
                    }
                    loc_l += 2;
                }
                loc_m++;
            }

            const aa_final = (par_gh === 3) ? this.x : this.xtemp;
            const z_final = (par_gh === 3) ? this.z : this.ztemp;

            if (par_gh === 3) {
                this.x = aa_final * loc_cd + z_final * loc_sd;
                this.z = z_final * loc_cd - aa_final * loc_sd;
            } else {
                this.xtemp = aa_final * loc_cd + z_final * loc_sd;
                this.ztemp = z_final * loc_cd - aa_final * loc_sd;
            }
        }

        /**
         * Convert vector components to declination (D), inclination (I), horizontal (H), and total intensity (F).
         */
        dihf(par_gh) {
            const SN = 0.0001;
            if (par_gh === 3) {
                const h2 = this.x * this.x + this.y * this.y;
                this.h = Math.sqrt(h2);
                this.f = Math.sqrt(h2 + this.z * this.z);
                if (this.f < SN) {
                    this.d = NaN; this.i = NaN;
                } else {
                    this.i = Math.atan2(this.z, this.h);
                    if (this.h < SN) {
                        this.d = NaN;
                    } else {
                        const hpx = this.h + this.x;
                        if (hpx < SN) {
                            this.d = Math.PI;
                        } else {
                            this.d = 2.0 * Math.atan2(this.y, hpx);
                        }
                    }
                }
            } else { // gh === 4
                const h2 = this.xtemp * this.xtemp + this.ytemp * this.ytemp;
                this.htemp = Math.sqrt(h2);
                this.ftemp = Math.sqrt(h2 + this.ztemp * this.ztemp);
                if (this.ftemp < SN) {
                    this.dtemp = NaN; this.itemp = NaN;
                } else {
                    this.itemp = Math.atan2(this.ztemp, this.htemp);
                    if (this.htemp < SN) {
                        this.dtemp = NaN;
                    } else {
                        const hpx = this.htemp + this.xtemp;
                        if (hpx < SN) {
                            this.dtemp = Math.PI;
                        } else {
                            this.dtemp = 2.0 * Math.atan2(this.ytemp, hpx);
                        }
                    }
                }
            }
       }

        /**
         * Calculates geomagnetic field components (D, I, F, H, X, Y, Z) for given parameters.
         * @param {number} par_sdate - Decimal year (epoch).
         * @param {number} par_igdgc - 1 for Geodetic (WGS84), 2 for Geocentric.
         * @param {number} par_alt - Altitude in km.
         * @param {number} par_lat - Latitude in degrees.
         * @param {number} par_long - Longitude in degrees.
         * @returns {object} Object with d_deg, i_deg, f: NaN, h: NaN, x: NaN, y: NaN, z: NaN };
         */
        getFieldComponents(par_sdate, par_igdgc, par_alt, par_lat, par_long) {
            let loc_model_i;
            for (loc_model_i = 0; loc_model_i < this.nmodel; loc_model_i++) {
                if (par_sdate < this.yrmax[loc_model_i]) break;
            }
            if (loc_model_i === this.nmodel) loc_model_i--;
            if (loc_model_i < 0 || loc_model_i >= this.nmodel || !this.irec_pos || !this.irec_pos[loc_model_i]) {
                return { d_deg: NaN, i_deg: NaN, f: NaN, h: NaN, x: NaN, y: NaN, z: NaN };
            }
            let loc_nmax;
            if (this.max2[loc_model_i] === 0) { // Interpolation
                if (loc_model_i + 1 >= this.nmodel || !this.irec_pos[loc_model_i + 1]) {
                    return { d_deg: NaN, i_deg: NaN, f: NaN, h: NaN, x: NaN, y: NaN, z: NaN };
                }
                this.getshc(1, this.irec_pos[loc_model_i], this.max1[loc_model_i], 1);
                this.getshc(1, this.irec_pos[loc_model_i + 1], this.max1[loc_model_i + 1], 2);
                loc_nmax = this.interpsh(par_sdate, this.yrmin[loc_model_i], this.max1[loc_model_i], this.yrmin[loc_model_i + 1], this.max1[loc_model_i + 1], 3);
            } else { // Extrapolation
                this.getshc(1, this.irec_pos[loc_model_i], this.max1[loc_model_i], 1);
                this.getshc(0, this.irec_pos[loc_model_i], this.max2[loc_model_i], 2);
                loc_nmax = this.extrapsh(par_sdate, this.epoch[loc_model_i], this.max1[loc_model_i], this.max2[loc_model_i], 3);
            }
            this.sh_val_3(par_igdgc, par_lat, par_long, par_alt, loc_nmax, 3);
            this.dihf(3);
            const d_deg = this.d * GL_RAD_TO_DEG;
            const i_deg = this.i * GL_RAD_TO_DEG;
            let loc_final_x = this.x, loc_final_y = this.y, loc_final_d_deg = d_deg;
            if (Math.abs(90.0 - Math.abs(par_lat)) <= 0.001) {
                loc_final_x = NaN; loc_final_y = NaN; loc_final_d_deg = NaN;
            }
            return {
                modelName: this.model[loc_model_i],
                d_deg: loc_final_d_deg, i_deg, h: this.h, x: loc_final_x, y: loc_final_y, z: this.z, f: this.f
            };
        }
    }


    // --- Output Formatting and UI Helper Functions ---

    function print_dashed_line() { console.log(' -------------------------------------------------------------------------------'); }
    function print_long_dashed_line() { console.log(' - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -'); }

    function print_header() {
        print_dashed_line();
        console.log('   Date          D           I           H        X        Y        Z        F');
        console.log('   (yr)      (deg min)   (deg min)     (nT)     (nT)     (nT)     (nT)     (nT)');
    }

    function print_header_sv() {
        console.log('   Date         dD          dI           dH       dX       dY       dZ       dF');
        console.log('   (yr)      (min/yr)    (min/yr)    (nT/yr)  (nT/yr)  (nT/yr)  (nT/yr)  (nT/yr)');
    }

    function format_angle(par_angle) {
        if (Number.isNaN(par_angle)) return { deg: 'NaN', min: '' };
        let loc_deg = Math.trunc(par_angle);
        let loc_min = (par_angle - loc_deg) * 60;
        if (par_angle > 0 && loc_min >= 59.5) { loc_min -= 60; loc_deg++; }
        if (par_angle < 0 && loc_min <= -59.5) { loc_min += 60; loc_deg--; }
        if (loc_deg !== 0) loc_min = Math.abs(loc_min);
        return { deg: loc_deg, min: Math.round(loc_min) };
    }

    function print_result(par_date, par_d_deg, par_i_deg, par_h, par_x, par_y, par_z, par_f) {
        const d_ang = format_angle(par_d_deg), i_ang = format_angle(par_i_deg);
        const date_str = par_date.toFixed(2).padStart(7);
        const d_str = Number.isNaN(par_d_deg) ? '     NaN    ' : `${String(d_ang.deg).padStart(4)} ${String(d_ang.min).padStart(2)}'`;
        const i_str = `${String(i_ang.deg).padStart(4)} ${String(i_ang.min).padStart(2)}'`;
        console.log(`${date_str}  ${d_str}  ${i_str}  ${par_h.toFixed(1).padStart(8)} ${par_x.toFixed(1).padStart(8)} ${par_y.toFixed(1).padStart(8)} ${par_z.toFixed(1).padStart(8)} ${par_f.toFixed(1).padStart(8)}`);
    }

    function print_result_sv(par_date, par_dd, par_id, par_hd, par_xd, par_yd, par_zd, par_fd) {
        const date_str = par_date.toFixed(2).padStart(7);
        const fmt = par_v => Number.isNaN(par_v) ? '     NaN' : par_v.toFixed(1).padStart(8);
        console.log(`${date_str}  ${fmt(par_dd)}   ${fmt(par_id)}    ${fmt(par_hd)} ${fmt(par_xd)} ${fmt(par_yd)} ${fmt(par_zd)} ${fmt(par_fd)}`);
    }

    function display_warnings(par_geomag, par_lat) {
        if (par_geomag.h < 5000.0 && par_geomag.h >= 1000.0) {
            console.log(`\nWarning: The horizontal field strength is only ${par_geomag.h.toFixed(1)} nT. Compass readings have large uncertainties.`);
        }
        if (par_geomag.h < 1000.0) {
            console.log(`\nWarning: The horizontal field strength is only ${par_geomag.h.toFixed(1)} nT. Compass readings have VERY LARGE uncertainties.`);
        }
        if (Math.abs(90.0 - Math.abs(par_lat)) <= 0.001) {
            console.log("\nWarning: Location is at a geographic pole. X, Y, and declination are not computed.");
        }
    }

    // --- Core Calculation and Application Logic ---

    /**
     * Performs a single geomagnetic calculation for a given set of parameters.
     * @param {CL_GEOMAG} par_geomag - The geomag model instance.
     * @param {object} par_params - { sdate, igdgc, alt, latitude, longitude }
     * @returns {boolean} - true if successful, false otherwise.
     */
    function CALCULATE_POINT(par_geomag, par_params) {
        const { sdate: SDATE, igdgc, alt, latitude: LATITUDE, longitude } = par_params;

        // Select the appropriate geomagnetic model based on the input date
        let loc_model_si;
        for (loc_model_si = 0; loc_model_si < par_geomag.nmodel; loc_model_si++) {
            if (SDATE < par_geomag.yrmax[loc_model_si]) break;
        }
        if (loc_model_si === par_geomag.nmodel) loc_model_si--;

        // Prepare spherical harmonic coefficients for the requested date:
        let loc_nmax;
        if (par_geomag.max2[loc_model_si] === 0) { // Interpolation between two models
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_si], par_geomag.max1[loc_model_si], 1);
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_si + 1], par_geomag.max1[loc_model_si + 1], 2);
            loc_nmax = par_geomag.interpsh(SDATE, par_geomag.yrmin[loc_model_si], par_geomag.max1[loc_model_si], par_geomag.yrmin[loc_model_si + 1], par_geomag.max1[loc_model_si + 1], 3);
            par_geomag.interpsh(SDATE + 1, par_geomag.yrmin[loc_model_si], par_geomag.max1[loc_model_si], par_geomag.yrmin[loc_model_si + 1], par_geomag.max1[loc_model_si + 1], 4);
        } else { // Extrapolation using secular variation
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_si], par_geomag.max1[loc_model_si], 1);
            par_geomag.getshc(0, par_geomag.irec_pos[loc_model_si], par_geomag.max2[loc_model_si], 2);
            loc_nmax = par_geomag.extrapsh(SDATE, par_geomag.epoch[loc_model_si], par_geomag.max1[loc_model_si], par_geomag.max2[loc_model_si], 3);
            par_geomag.extrapsh(SDATE + 1, par_geomag.epoch[loc_model_si], par_geomag.max1[loc_model_si], par_geomag.max2[loc_model_si], 4);
        }

        // Calculate geomagnetic field vector components
        par_geomag.sh_val_3(igdgc, LATITUDE, longitude, alt, loc_nmax, 3); // for date
        par_geomag.dihf(3);
        par_geomag.sh_val_3(igdgc, LATITUDE, longitude, alt, loc_nmax, 4); // for date + 1 year
        par_geomag.dihf(4);

        // -- Output Results --
        // Convert radians to degrees for printing
        const D_DEG = par_geomag.d * GL_RAD_TO_DEG;
        const I_DEG = par_geomag.i * GL_RAD_TO_DEG;

        // Compute annual change (secular variation)
        let loc_d_dot = (par_geomag.dtemp - par_geomag.d) * GL_RAD_TO_DEG;
        if (loc_d_dot > 180.0) loc_d_dot -= 360.0;
        if (loc_d_dot <= -180.0) loc_d_dot += 360.0;
        loc_d_dot *= 60.0; // Convert to minutes/year

        const IDOT = (par_geomag.itemp - par_geomag.i) * GL_RAD_TO_DEG * 60.0;
        const HDOT = par_geomag.htemp - par_geomag.h;
        const XDOT = par_geomag.xtemp - par_geomag.x;
        const YDOT = par_geomag.ytemp - par_geomag.y;
        const ZDOT = par_geomag.ztemp - par_geomag.z;
        const FDOT = par_geomag.ftemp - par_geomag.f;

        // Handle special cases for printing
        let loc_final_d_deg = D_DEG;
        let loc_final_x = par_geomag.x, loc_final_y = par_geomag.y;
        let loc_final_ddot = loc_d_dot;
        if (par_geomag.h < 100.0) { loc_final_d_deg = NaN; loc_final_ddot = NaN; }
        if (Math.abs(90.0 - Math.abs(LATITUDE)) <= 0.001) {
            loc_final_x = NaN; loc_final_y = NaN; loc_final_d_deg = NaN; loc_final_ddot = NaN;
        }

        console.log(`\n\n\n  Model: ${par_geomag.model[loc_model_si]}`);
        console.log(`  Latitude:  ${LATITUDE.toFixed(2)} deg`);
        console.log(`  Longitude: ${longitude.toFixed(2)} deg`);
        console.log(`  Altitude:  ${alt.toFixed(2)} km`);
        console.log(`  Date:      ${SDATE.toFixed(2)}\n`);

        print_header();
        print_result(SDATE, loc_final_d_deg, I_DEG, par_geomag.h, loc_final_x, loc_final_y, par_geomag.z, par_geomag.f);
        print_long_dashed_line();
        print_header_sv();
        print_result_sv(SDATE, loc_final_ddot, IDOT, HDOT, XDOT, YDOT, ZDOT, FDOT);
        print_dashed_line();

        display_warnings(par_geomag, LATITUDE);
        return true;
    }

    /**
     * Prompts user for parameters to calculate a single point.
     * @param {CL_GEOMAG} par_geomag - The geomag model instance.
     */
    function CALC_SINGLE_POINT(par_geomag) {
        const { minyr, maxyr: MAX_YR } = par_geomag;
        let loc_s_date = -1, loc_igdgc = -1, loc_alt = -999999, loc_lat = 200, loc_long = 200;

        while (loc_s_date < minyr || loc_s_date > MAX_YR + 1) {
            loc_s_date = parseFloat(prompt(`Enter decimal date (${minyr.toFixed(2)} to ${MAX_YR.toFixed(0)}): `));
            if (loc_s_date > MAX_YR && loc_s_date < MAX_YR + 1) {
                console.log(`Warning: Date ${loc_s_date.toFixed(2)} is out of range but within one year of model expiration.`);
            }
        }

        while (loc_igdgc !== 1 && loc_igdgc !== 2) {
            console.log("\nEnter Coordinate Preference:\n    1) Geodetic (WGS84)\n    2) Geocentric (spherical)");
            loc_igdgc = parseInt(prompt("Selection ==> "));
        }

        const MIN_ALT_DISP = loc_igdgc === 2 ? par_geomag.altmin[0] + 6371.2 : par_geomag.altmin[0];
        const MAX_ALT_DISP = loc_igdgc === 2 ? par_geomag.altmax[0] + 6371.2 : par_geomag.altmax[0];
        loc_alt = parseFloat(prompt(`Enter altitude in km (${MIN_ALT_DISP.toFixed(2)} to ${MAX_ALT_DISP.toFixed(2)}): `));

        while (loc_lat < -90 || loc_lat > 90) {
            loc_lat = parseFloat(prompt("Enter decimal loc_latitude (-90 to 90): "));
        }

        while (loc_long < -180 || loc_long > 180) {
            loc_long = parseFloat(prompt("Enter decimal loc_long (-180 to 180): "));
        }

        CALCULATE_POINT(par_geomag, {sdate: loc_s_date, igdgc: loc_igdgc, alt: loc_alt, latitude: loc_lat, longitude: loc_long});
    }

    // --- START: New functions for NOAA-style output ---

    /**
     * Prints a table of geomagnetic data formatted to match the ngdc.noaa.gov website style.
     * @param {Array<object>} par_results - Array of calculation result objects for each date.
     * @param {object} par_sv - Object containing the secular variation (annual change) data.
     * @param {object} par_loc_Info - Object with location and model details.
     */
    function PRINT_NOAA_STYLE_TABLE(par_results, par_sv, par_loc_Info) {
        const { modelName: MODEL_NAME, latitude, longitude, alt } = par_loc_Info;

        // Helper functions for formatting location
        const FORMAT_LAT = (par_lat) => `${Math.abs(par_lat).toFixed(0)}° ${par_lat >= 0 ? 'N' : 'S'}`;
        const FORMAT_LON = (par_lon) => `${Math.abs(par_lon).toFixed(0)}° ${par_lon > 0 ? 'E' : 'W'}`;

        // --- Column Widths definitions (inner width, not including separators) ---
        const WIDTHS = {
            date: 12,
            dec: 14,
            inc: 14,
            h_int: 20,
            north: 17,
            east: 16,
            vert: 18,
            total: 15
        };

        // Calculate total width for the horizontal lines
        const TOTAL_TABLE_WIDTH = Object.values(WIDTHS).reduce((par_sum, par_w) => par_sum + par_w + 1, 0);

        // --- Build Header Block ---
        console.log('\n' + '─'.repeat(TOTAL_TABLE_WIDTH));
        console.log('Magnetic Field');
        console.log('─'.repeat(TOTAL_TABLE_WIDTH));
        console.log(`Model Used:  ${MODEL_NAME}`);
        console.log(`Latitude:    ${FORMAT_LAT(latitude)}`);
        console.log(`Longitude:   ${FORMAT_LON(longitude)}`);
        console.log(`Elevation:   ${alt.toFixed(1)} km Mean Sea Level`);

        // --- Build Table Separator Line ---
        const HLINE = '+' + Object.values(WIDTHS).map(w => '─'.repeat(w)).join('+') + '+';
        console.log(HLINE);

        // --- Build Table Header ---
        const HEADER1 = `| ${'Date'.padEnd(WIDTHS.date - 1)}` +
                        `| ${'Declination'.padEnd(WIDTHS.dec - 1)}` +
                        `| ${'Inclination'.padEnd(WIDTHS.inc - 1)}` +
                        `| ${'Horizontal'.padEnd(WIDTHS.h_int - 1)}` +
                        `| ${'North Comp'.padEnd(WIDTHS.north - 1)}` +
                        `| ${'East Comp'.padEnd(WIDTHS.east - 1)}` +
                        `| ${'Vertical Comp'.padEnd(WIDTHS.vert - 1)}` +
                        `| ${'Total Field'.padEnd(WIDTHS.total - 1)}|`;

        const HEADER2 = `| ${''.padEnd(WIDTHS.date - 1)}` +
                        `| ${'( + E | - W )'.padEnd(WIDTHS.dec - 1)}` +
                        `| ${'( + D | - U)'.padEnd(WIDTHS.inc - 1)}` +
                        `| ${'Intensity'.padEnd(WIDTHS.h_int - 1)}` +
                        `| ${'( + N | - S )'.padEnd(WIDTHS.north - 1)}` +
                        `| ${'( + E | - W )'.padEnd(WIDTHS.east - 1)}` +
                        `| ${'( + D | - U )'.padEnd(WIDTHS.vert - 1)}` +
                        `| ${''.padEnd(WIDTHS.total - 1)}|`;

        console.log(HEADER1);
        console.log(HEADER2);
        console.log(HLINE);

        // --- Build Data Rows ---
        par_results.forEach(par_res => {
            const ROW = `| ${par_res.dateStr.padEnd(WIDTHS.date - 1)}` +
                        `|${(par_res.d_deg.toFixed(4) + '°').padStart(WIDTHS.dec)}` +
                        `|${(par_res.i_deg.toFixed(4) + '°').padStart(WIDTHS.inc)}` +
                        `|${(par_res.h.toFixed(1) + ' nT').padStart(WIDTHS.h_int)}` +
                        `|${(par_res.x.toFixed(1) + ' nT').padStart(WIDTHS.north)}` +
                        `|${(par_res.y.toFixed(1) + ' nT').padStart(WIDTHS.east)}` +
                        `|${(par_res.z.toFixed(1) + ' nT').padStart(WIDTHS.vert)}` +
                        `|${(par_res.f.toFixed(1) + ' nT').padStart(WIDTHS.total)}|`;
            console.log(ROW);
        });

        // --- Build Change/year Row ---
        const CHANGE_ROW = `| ${'Change/year'.padEnd(WIDTHS.date - 1)}` +
                          `|${(par_sv.ddot_deg.toFixed(4) + '°/yr').padStart(WIDTHS.dec)}` +
                          `|${(par_sv.idot_deg.toFixed(4) + '°/yr').padStart(WIDTHS.inc)}` +
                          `|${(par_sv.hdot.toFixed(1) + ' nT/yr').padStart(WIDTHS.h_int)}` +
                          `|${(par_sv.xdot.toFixed(1) + ' nT/yr').padStart(WIDTHS.north)}` +
                          `|${(par_sv.ydot.toFixed(1) + ' nT/yr').padStart(WIDTHS.east)}` +
                          `|${(par_sv.zdot.toFixed(1) + ' nT/yr').padStart(WIDTHS.vert)}` +
                          `|${(par_sv.fdot.toFixed(1) + ' nT/yr').padStart(WIDTHS.total)}|`;
        console.log(CHANGE_ROW);

        // --- Build Uncertainty Row --- #TODO понять как рассчитывать погрешность
        const UNCERTAINTY_ROW = `| ${'Uncertainty'.padEnd(WIDTHS.date - 1)}` +
                               `|${'0.55°'.padStart(WIDTHS.dec)}` +
                               `|${'0.19°'.padStart(WIDTHS.inc)}` +
                               `|${'130 nT'.padStart(WIDTHS.h_int)}` +
                               `|${'135 nT'.padStart(WIDTHS.north)}` +
                               `|${'85 nT'.padStart(WIDTHS.east)}` +
                               `|${'134 nT'.padStart(WIDTHS.vert)}` +
                               `|${'134 nT'.padStart(WIDTHS.total)}|`;
        // console.log(uncertaintyRow);

        // --- Build Footer ---
        console.log(HLINE);
    }

    /**
     * Calculates only the main field components for a single date.
     * @returns {object} An object with the calculated field values.
     */
    function CALCULATE_FIELD_AT_DATE(par_geomag, par_sdate, par_igdgc, par_alt, par_lat, par_long) {
        let loc_model_i;
        for (loc_model_i = 0; loc_model_i < par_geomag.nmodel; loc_model_i++) {
            if (par_sdate < par_geomag.yrmax[loc_model_i]) break;
        }
        if (loc_model_i === par_geomag.nmodel) loc_model_i--;

        let loc_n_max;
        if (par_geomag.max2[loc_model_i] === 0) {
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_i], par_geomag.max1[loc_model_i], 1);
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_i + 1], par_geomag.max1[loc_model_i + 1], 2);
            loc_n_max = par_geomag.interpsh(par_sdate, par_geomag.yrmin[loc_model_i], par_geomag.max1[loc_model_i], par_geomag.yrmin[loc_model_i + 1], par_geomag.max1[loc_model_i + 1], 3);
        } else {
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_i], par_geomag.max1[loc_model_i], 1);
            par_geomag.getshc(0, par_geomag.irec_pos[loc_model_i], par_geomag.max2[loc_model_i], 2);
            loc_n_max = par_geomag.extrapsh(par_sdate, par_geomag.epoch[loc_model_i], par_geomag.max1[loc_model_i], par_geomag.max2[loc_model_i], 3);
        }

        par_geomag.sh_val_3(par_igdgc, par_lat, par_long, par_alt, loc_n_max, 3);
        par_geomag.dihf(3);

        const D_DEG = par_geomag.d * GL_RAD_TO_DEG;
        const I_DEG = par_geomag.i * GL_RAD_TO_DEG;
        let loc_final_x = par_geomag.x, final_y = par_geomag.y, final_d_deg = D_DEG;

        if (Math.abs(90.0 - Math.abs(par_lat)) <= 0.001) {
            loc_final_x = NaN; final_y = NaN; final_d_deg = NaN;
        }

        return {
            modelName: par_geomag.model[loc_model_i],
            d_deg: final_d_deg, i_deg: I_DEG, h: par_geomag.h, x: loc_final_x, y: final_y, z: par_geomag.z, f: par_geomag.f
        };
    }

    /**
     * Calculates the secular variation (annual change) for a specific date.
     * @returns {object} An object with the calculated rates of change.
     */
    function GET_SECULAR_VARIATION(par_geomag, par_params) {
        const { sdate, igdgc, alt, latitude, longitude } = par_params;

        let loc_model_I;
        for (loc_model_I = 0; loc_model_I < par_geomag.nmodel; loc_model_I++) {
            if (sdate < par_geomag.yrmax[loc_model_I]) break;
        }
        if (loc_model_I === par_geomag.nmodel) loc_model_I--;

        let loc_n_max;
        if (par_geomag.max2[loc_model_I] === 0) {
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_I], par_geomag.max1[loc_model_I], 1);
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_I + 1], par_geomag.max1[loc_model_I + 1], 2);
            loc_n_max = par_geomag.interpsh(sdate, par_geomag.yrmin[loc_model_I], par_geomag.max1[loc_model_I], par_geomag.yrmin[loc_model_I + 1], par_geomag.max1[loc_model_I + 1], 3);
            par_geomag.interpsh(sdate + 1, par_geomag.yrmin[loc_model_I], par_geomag.max1[loc_model_I], par_geomag.yrmin[loc_model_I + 1], par_geomag.max1[loc_model_I + 1], 4);
        } else {
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_I], par_geomag.max1[loc_model_I], 1);
            par_geomag.getshc(0, par_geomag.irec_pos[loc_model_I], par_geomag.max2[loc_model_I], 2);
            loc_n_max = par_geomag.extrapsh(sdate, par_geomag.epoch[loc_model_I], par_geomag.max1[loc_model_I], par_geomag.max2[loc_model_I], 3);
            par_geomag.extrapsh(sdate + 1, par_geomag.epoch[loc_model_I], par_geomag.max1[loc_model_I], par_geomag.max2[loc_model_I], 4);
        }

        par_geomag.sh_val_3(igdgc, latitude, longitude, alt, loc_n_max, 3);
        par_geomag.dihf(3);
        par_geomag.sh_val_3(igdgc, latitude, longitude, alt, loc_n_max, 4);
        par_geomag.dihf(4);

        let loc_ddot_raw = (par_geomag.dtemp - par_geomag.d) * GL_RAD_TO_DEG;
        if (loc_ddot_raw > 180.0) loc_ddot_raw -= 360.0;
        if (loc_ddot_raw <= -180.0) loc_ddot_raw += 360.0;

        let loc_ddot_deg = loc_ddot_raw;
        const IDOT_DEG = (par_geomag.itemp - par_geomag.i) * GL_RAD_TO_DEG;
        const HDOT = par_geomag.htemp - par_geomag.h;
        let loc_xdot = par_geomag.xtemp - par_geomag.x;
        let loc_ydot = par_geomag.ytemp - par_geomag.y;
        const Z_DOT = par_geomag.ztemp - par_geomag.z;
        const F_DOT = par_geomag.ftemp - par_geomag.f;

        if (Math.abs(90.0 - Math.abs(latitude)) <= 0.001) {
          loc_ddot_deg = NaN; loc_xdot = NaN; loc_ydot = NaN;
        }
        return { ddot_deg: loc_ddot_deg, idot_deg: IDOT_DEG, hdot: HDOT, xdot: loc_xdot, ydot: loc_ydot, zdot: Z_DOT, fdot: F_DOT };
    }

    /**
     * Prompts user for parameters and calculates a range of dates, printing in NOAA format.
     * @param {CL_GEOMAG} par_geomag - The geomag model instance.
     */
    function CALCULATE_DATE_RANGE_NOAA(par_geomag) {
        console.log('\n--- Calculate Field for a Date Range (NOAA Format) ---');
        let loc_start_year = parseInt(prompt('Enter start year (e.g. 2025): '));
        let loc_end_year = parseInt(prompt('Enter end year (e.g. 2029): '));
        let loc_step = parseInt(prompt('Enter step in years (e.g. 1): '));

        let loc_month = parseInt(prompt('Enter month (1-12): '));
        let loc_day = parseInt(prompt('Enter day (1-31): '));

        let loc_igdgc = -1;
        while (loc_igdgc !== 1 && loc_igdgc !== 2) {
            console.log("\nEnter Coordinate Preference:\n    1) Geodetic (WGS84)\n    2) Geocentric (spherical)");
            loc_igdgc = parseInt(prompt("Selection ==> "));
        }
        let loc_alt = parseFloat(prompt('Enter altitude in km: '));
        let loc_lat = parseFloat(prompt('Enter decimal latitude (-90 to 90): '));
        let loc_long = parseFloat(prompt('Enter decimal longitude (-180 to 180): '));
        console.log("Calculating...");

        let loc_results = [];
        let loc_model_name = '';

        // Note: The example image has one odd date (2028-06-30). This loop uses a fixed day/month for simplicity.
        // The logic can be extended to handle arrays of specific dates if needed.
        for (let loc_year = loc_start_year; loc_year <= loc_end_year; loc_year += loc_step) {
            const S_DATE = par_geomag.julday(loc_month, loc_day, loc_year);
            const DATE_STR = `${loc_year}-${String(loc_month).padStart(2, '0')}-${String(loc_day).padStart(2, '0')}`;

            const pointGeomag = new CL_GEOMAG();
            pointGeomag.modelData = par_geomag.modelData;
            Object.assign(pointGeomag, {
                 model: par_geomag.model, nmodel: par_geomag.nmodel, epoch: par_geomag.epoch,
                 yrmin: par_geomag.yrmin, yrmax: par_geomag.yrmax, altmin: par_geomag.altmin, altmax: par_geomag.altmax,
                 max1: par_geomag.max1, max2: par_geomag.max2, max3: par_geomag.max3, irec_pos: par_geomag.irec_pos
            });

            const DATA = CALCULATE_FIELD_AT_DATE(pointGeomag, S_DATE, loc_igdgc, loc_alt, loc_lat, loc_long);
            if (!loc_model_name) loc_model_name = DATA.modelName;

            loc_results.push({ sdate: S_DATE, dateStr: DATE_STR, ...DATA });
        }

        if (loc_results.length === 0) {
            console.log("No dates in the specified range. Nothing to calculate.");
            return;
        }

        const SV_GEOMAG = new CL_GEOMAG();
        SV_GEOMAG.modelData = par_geomag.modelData;
        Object.assign(SV_GEOMAG, {
                model: par_geomag.model, nmodel: par_geomag.nmodel, epoch: par_geomag.epoch,
                yrmin: par_geomag.yrmin, yrmax: par_geomag.yrmax, altmin: par_geomag.altmin, altmax: par_geomag.altmax,
                max1: par_geomag.max1, max2: par_geomag.max2, max3: par_geomag.max3, irec_pos: par_geomag.irec_pos
        });
        const SV = GET_SECULAR_VARIATION(SV_GEOMAG, { sdate: loc_results[0].sdate, igdgc: loc_igdgc, alt: loc_alt, latitude: loc_lat, longitude: loc_long });

        const LOCATION_INFO = { modelName: loc_model_name, latitude: loc_lat, longitude: loc_long, alt: loc_alt };
        PRINT_NOAA_STYLE_TABLE(loc_results, SV, LOCATION_INFO);
    }
    // --- END: New functions for NOAA-style output ---

    /**
     * Main program execution: process inputs, perform geomagnetic calculations, and output results.
     */
    async function main() {
        const ARGS = process.argv.slice(2);

        console.log("\n\nGeomag v7.0 (JavaScript port, v3) - Compatible with WMM and IGRF");

        if (ARGS.length > 0) {
            await RUN_FROM_ARGS(ARGS);
            return;
        }

        await RUN_INTERACTIVE();
    }

    /**
     * Run program from command-line arguments and exit.
     */
    async function RUN_FROM_ARGS(par_args) {
        if (par_args.length === 1 && (par_args[0] === 'h' || par_args[0] === '?')) {
            console.log("\nUsage (command line): node geomag.js model_file date coord alt lat lon");
            console.log("Example: node geomag.js IGRF14.COF 2023.5 D K10 55.75 37.61");
            return;
        }
        if (par_args.length < 6) {
            console.log("Error: Not enough arguments provided for command-line execution.");
            console.log("Usage: node geomag.js model_file date coord alt lat lon");
            return;
        }

        const GEOMAG = new CL_GEOMAG();
        if (!GEOMAG.loadModelFile(par_args[0])) return;

        const DATE_ARG = par_args[1];
        let loc_s_date;
        if (DATE_ARG.includes(',')) {
            const PARTS = DATE_ARG.split(',');
            loc_s_date = GEOMAG.julday(parseInt(PARTS[1]), parseInt(PARTS[2]), parseInt(PARTS[0]));
        } else {
            loc_s_date = parseFloat(DATE_ARG);
        }

        const IGDGC = par_args[2].toUpperCase() === 'D' ? 1 : 2;
        const ALTARG = par_args[3];
        const UNIT_CHAR = ALTARG.charAt(0).toUpperCase();
        let loc_alt = parseFloat(ALTARG.substring(1));
        if (UNIT_CHAR === 'M') loc_alt *= 0.001;
        else if (UNIT_CHAR === 'F') loc_alt /= GL_FT_TO_KM;

        const LATITUDE = parseFloat(par_args[4]);
        const LONGITUDE = parseFloat(par_args[5]);

        CALCULATE_POINT(GEOMAG, { sdate: loc_s_date, igdgc: IGDGC, alt: loc_alt, latitude: LATITUDE, longitude: LONGITUDE });
    }

    /**
     * Run program in interactive mode.
     */
    async function RUN_INTERACTIVE() {
        const GEOMAG = new CL_GEOMAG();

        while(true) { // Outer loop for model selection
            let loc_mdfile = "";
            while(true) { // Loop until a valid model is loaded
                const COF_FILES = fs.readdirSync('.').filter(f => f.toLowerCase().endsWith('.cof'));
                console.log("\n--- Model File Selection ---");
                if (COF_FILES.length > 0) {
                    console.log('Available model files:');
                    COF_FILES.forEach((f, i) => console.log(`  ${i + 1}) ${f}`));
                    let loc_file_choice = prompt('Select model file by number or enter filename: ');
                    if (/^\d+$/.test(loc_file_choice) && parseInt(loc_file_choice) >= 1 && parseInt(loc_file_choice) <= COF_FILES.length) {
                        loc_mdfile = COF_FILES[parseInt(loc_file_choice) - 1];
                    } else {
                        loc_mdfile = loc_file_choice;
                    }
                } else {
                    loc_mdfile = prompt("Enter the model data file name (e.g., IGRF14.COF): ");
                }

                if(GEOMAG.loadModelFile(loc_mdfile)) {
                    console.log(`Model file "${loc_mdfile}" loaded successfully.`);
                    break; // Exit model selection loop
                }
            }

            let loc_stay_in_calc_loop = true;
            while(loc_stay_in_calc_loop) { // Inner loop for calculations
                console.log('\n--- Main Menu ---');
                console.log(`Model: ${GEOMAG.mdfile} (Valid ${GEOMAG.minyr.toFixed(1)}-${GEOMAG.maxyr.toFixed(1)})`);
                console.log('1) Calculate field at a single point');
                console.log('2) Calculate field over a range of dates (NOAA format)');
                console.log('3) Load a different model file');
                console.log('0) Quit');
                const CHOICE = prompt('Selection ==> ');

                switch(CHOICE) {
                    case '1':
                        CALC_SINGLE_POINT(GEOMAG);
                        break;
                    case '2':
                        CALCULATE_DATE_RANGE_NOAA(GEOMAG);
                        break;
                    case '3':
                        loc_stay_in_calc_loop = false; // Breaks inner loop to go to outer loop
                        break;
                    case '0':
                        console.log("Exiting program.");
                        return; // Exit entire function
                    default:
                        console.log("Invalid selection, please try again.");
                        break;
                }
            }
        }
    }

    // At the end of the file, expose CL_GEOMAG globally for browser
    if (typeof window !== 'undefined') {
        window.CL_GEOMAG = CL_GEOMAG;
    }
    // Only run main() in Node.js, not in browser
    if (typeof window === 'undefined') {
        main();
    }

    // Export CL_GEOMAG for module usage
    export { CL_GEOMAG };
