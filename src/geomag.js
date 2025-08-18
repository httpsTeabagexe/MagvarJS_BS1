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

    // --- Глобальные константы с префиксом K_ ---
    const K_FT2KM = 1.0 / 0.0003048; // Conversion factor: feet to kilometers
    const K_RAD2DEG = 180.0 / Math.PI; // Conversion factor: radians to degrees
    const K_DTR = Math.PI / 180.0; // Conversion factor: degrees to radians
    const K_MAXMOD = 30; // Maximum number of models
    const K_MAXDEG = 13; // Maximum degree
    const K_MAXCOEFF = K_MAXDEG * (K_MAXDEG + 2) + 1; // +1 for 1-based indexing

    /**
     * Класс для инкапсуляции состояния и логики геомагнитной модели.
     */
    class Geomag {
        constructor() {
            this.gh1 = new Array(K_MAXCOEFF).fill(0);
            this.gh2 = new Array(K_MAXCOEFF).fill(0);
            this.gha = new Array(K_MAXCOEFF).fill(0);
            this.ghb = new Array(K_MAXCOEFF).fill(0);
            this.d = 0; this.f = 0; this.h = 0; this.i = 0;
            this.dtemp = 1; this.ftemp = 0; this.htemp = 0; this.itemp = 0;
            this.x = 0; this.y = 0; this.z = 0;
            this.xtemp = 0; this.ytemp = 0; this.ztemp = 0;
            this.epoch = new Array(K_MAXMOD).fill(0);
            this.yrmin = new Array(K_MAXMOD).fill(0);
            this.yrmax = new Array(K_MAXMOD).fill(0);
            this.altmin = new Array(K_MAXMOD).fill(0);
            this.altmax = new Array(K_MAXMOD).fill(0);
            this.max1 = new Array(K_MAXMOD).fill(0);
            this.max2 = new Array(K_MAXMOD).fill(0);
            this.max3 = new Array(K_MAXMOD).fill(0);
            this.model = Array.from({ length: K_MAXMOD }, () => "");
            this.irec_pos = new Array(K_MAXMOD).fill(0);
            this.modelData = null;
            this.nmodel = 0;
            this.minyr = 0;
            this.maxyr = 0;
            this.mdfile = "";
        }

        /**
         * Convert month, day, year to decimal year (fractional).
         */
        julday(par_month, par_day, par_year) {
            const days = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
            const leap_year = (((par_year % 4) === 0) && (((par_year % 100) !== 0) || ((par_year % 400) === 0)));
            const day_in_year = (days[par_month - 1] + par_day + (par_month > 2 && leap_year ? 1 : 0));
            return par_year + (day_in_year / (365.0 + (leap_year ? 1 : 0)));
        }

        /**
         * Load and parse model file headers to extract model parameters.
         * Optimized for compatibility: detects headers by 3+ leading spaces, parses as many fields as present, defaults missing to zero.
         */
        loadModelFile(mdfile) {
            try {
                this.mdfile = mdfile;
                const fileContent = fs.readFileSync(this.mdfile, 'utf8');
                this.modelData = fileContent.split(/\r?\n/);
            } catch (e) {
                console.log(`\nError opening file ${mdfile}.`);
                return false;
            }

            let modelI = -1;
            this.modelData.forEach((line, index) => {
                // Match C logic: header line starts with at least 3 spaces
                if (/^\s{3,}/.test(line)) {
                    modelI++;
                    if (modelI >= K_MAXMOD) {
                        console.log(`Too many models in file ${this.mdfile} on line ${index + 1}.`);
                        process.exit(6);
                    }
                    const parts = line.trim().split(/\s+/);
                    // Parse as many fields as present, defaulting missing to zero
                    this.model[modelI] = parts[0] || '';
                    this.epoch[modelI] = parseFloat(parts[1]) || 0;
                    this.max1[modelI] = parseInt(parts[2]) || 0;
                    this.max2[modelI] = parseInt(parts[3]) || 0;
                    this.max3[modelI] = parseInt(parts[4]) || 0;
                    this.yrmin[modelI] = parseFloat(parts[5]) || 0;
                    this.yrmax[modelI] = parseFloat(parts[6]) || 0;
                    this.altmin[modelI] = parseFloat(parts[7]) || 0;
                    this.altmax[modelI] = parseFloat(parts[8]) || 0;
                    this.irec_pos[modelI] = index + 1;
                    if (modelI === 0) {
                        this.minyr = this.yrmin[0];
                        this.maxyr = this.yrmax[0];
                    } else {
                        if (this.yrmin[modelI] < this.minyr) this.minyr = this.yrmin[modelI];
                        if (this.yrmax[modelI] > this.maxyr) this.maxyr = this.yrmax[modelI];
                    }
                }
            });
            this.nmodel = modelI + 1;
            if (this.nmodel === 0) {
                console.log(`No valid model data found in ${mdfile}.`);
                return false;
            }
            return true;
        }

        /**
         * Read spherical harmonic coefficients from the model data.
         */
        getshc(par_iflag, par_strec, par_nmax_of_gh, par_gh) {
            let line_num = par_strec;
            let ii = 0;

            for (let nn = 1; nn <= par_nmax_of_gh; nn++) {
                for (let mm = 0; mm <= nn; mm++) {
                    const line = this.modelData[line_num];
                    if (!line) {
                        console.log(`Error: Unexpected end of file while reading coefficients.`);
                        process.exit(1);
                    }
                    let parts = line.trim().split(/\s+/);

                    // Если строка начинается с 'g' или 'h' (формат IGRF), удаляем этот элемент
                    if (parts[0] === 'g' || parts[0] === 'h') {
                        parts.shift();
                    }

                    const n = parseInt(parts[0]);
                    const m = parseInt(parts[1]);
                    // iflag=1 читает основное поле, iflag=0 - вековую вариацию
                    const g = parseFloat(parts[par_iflag === 1 ? 2 : 4]);
                    const hh = parseFloat(parts[par_iflag === 1 ? 3 : 5]);

                    if (nn !== n || mm !== m) {
                        console.log(`Error: Corrupt record in model file at line ${line_num + 1}. Expected n=${nn}, m=${mm} but got n=${n}, m=${m}.`);
                        console.log(`Line content: "${line}"`);
                        process.exit(5);
                    }

                    ii++;
                    if (par_gh === 1) this.gh1[ii] = g;
                    else this.gh2[ii] = g;

                    if (m !== 0) {
                        ii++;
                        if (par_gh === 1) this.gh1[ii] = hh;
                        else this.gh2[ii] = hh;
                    }
                    line_num++;
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
                    for (let ii = loc_k + 1; ii <= loc_l; ++ii) {
                        target[ii] = this.gh1[ii];
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
            for (let ii = 1; ii <= loc_k; ++ii) {
                target[ii] = this.gh1[ii] + factor * this.gh2[ii];
            }
            return loc_nmax;
        }

        /**
         * Interpolate spherical harmonic coefficients between two model epochs.
         */
        interpsh(loc_date, par_dte1, par_nmax1, par_dte2, par_nmax2, par_gh) {
            let loc_nmax;
            let loc_k, loc_l;
            const factor = (loc_date - par_dte1) / (par_dte2 - par_dte1);

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
            for (let ii = 1; ii <= loc_k; ++ii) {
                target[ii] = this.gh1[ii] + factor * (this.gh2[ii] - this.gh1[ii]);
            }
            return loc_nmax;
        }

        /**
         * Compute geomagnetic field vector components (X, Y, Z) using spherical harmonics.
         */
        shval3(par_igdgc, par_f_lat, par_f_lon, par_elev, par_nmax, par_gh) {
            const earths_radius = 6371.2;
            const a2 = 40680631.59; /* WGS84 */
            const b2 = 40408299.98; /* WGS84 */
            const sl = new Array(14).fill(0);
            const cl = new Array(14).fill(0);
            const p = new Array(119).fill(0);
            const q = new Array(119).fill(0);

            let loc_r = par_elev;
            let loc_s_lat = Math.sin(par_f_lat * K_DTR);
            let loc_c_lat;

            if (Math.abs(90.0 - par_f_lat) < 0.001) {
                loc_c_lat = Math.cos(89.999 * K_DTR);
            } else if (Math.abs(90.0 + par_f_lat) < 0.001) {
                loc_c_lat = Math.cos(-89.999 * K_DTR);
            } else {
                loc_c_lat = Math.cos(par_f_lat * K_DTR);
            }

            sl[1] = Math.sin(par_f_lon * K_DTR);
            cl[1] = Math.cos(par_f_lon * K_DTR);

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
                const aa_gd = a2 * loc_c_lat * loc_c_lat;
                const bb_gd = b2 * loc_s_lat * loc_s_lat;
                const cc_gd = aa_gd + bb_gd;
                const dd_gd = Math.sqrt(cc_gd);
                loc_r = Math.sqrt(par_elev * (par_elev + 2.0 * dd_gd) + (a2 * aa_gd + b2 * bb_gd) / cc_gd);
                loc_cd = (par_elev + dd_gd) / loc_r;
                loc_sd = (a2 - b2) / dd_gd * loc_s_lat * loc_c_lat / loc_r;
                const aa_slat = loc_s_lat;
                loc_s_lat = loc_s_lat * loc_cd - loc_c_lat * loc_sd;
                loc_c_lat = loc_c_lat * loc_cd + aa_slat * loc_sd;
            }

            const ratio = earths_radius / loc_r;
            const aa = Math.sqrt(3.0);
            p[1] = 2.0 * loc_s_lat;
            p[2] = 2.0 * loc_c_lat;
            p[3] = 4.5 * loc_s_lat * loc_s_lat - 1.5;
            p[4] = 3.0 * aa * loc_c_lat * loc_s_lat;
            q[1] = -loc_c_lat;
            q[2] = loc_s_lat;
            q[3] = -3.0 * loc_c_lat * loc_s_lat;
            q[4] = aa * (loc_s_lat * loc_s_lat - loc_c_lat * loc_c_lat);

            const gh_arr = (par_gh === 3) ? this.gha : this.ghb;
            let loc_fn = 0;

            for (let k = 1; k <= npq; ++k) {
                if (loc_n < loc_m) {
                    loc_m = 0;
                    loc_n++;
                    loc_fn = loc_n;
                }
                const rr = Math.pow(ratio, loc_n + 2);
                const fm = loc_m;

                if (k >= 5) {
                    if (loc_m === loc_n) {
                        const aa_p = Math.sqrt(1.0 - 0.5 / fm);
                        const j = k - loc_n - 1;
                        p[k] = (1.0 + 1.0 / fm) * aa_p * loc_c_lat * p[j];
                        q[k] = aa_p * (loc_c_lat * q[j] + loc_s_lat / fm * p[j]);
                        sl[loc_m] = sl[loc_m - 1] * cl[1] + cl[loc_m - 1] * sl[1];
                        cl[loc_m] = cl[loc_m - 1] * cl[1] - sl[loc_m - 1] * sl[1];
                    } else {
                        const aa_p = Math.sqrt(loc_fn * loc_fn - fm * fm);
                        const bb_p = Math.sqrt(((loc_fn - 1.0) * (loc_fn - 1.0)) - (fm * fm)) / aa_p;
                        const cc_p = (2.0 * loc_fn - 1.0) / aa_p;
                        const ii = k - loc_n;
                        const j = k - 2 * loc_n + 1;
                        p[k] = (loc_fn + 1.0) * (cc_p * loc_s_lat / loc_fn * p[ii] - bb_p / (loc_fn - 1.0) * p[j]);
                        q[k] = cc_p * (loc_s_lat * q[ii] - loc_c_lat / loc_fn * p[ii]) - bb_p * q[j];
                    }
                }

                const aa_sh = rr * gh_arr[loc_l];

                if (loc_m === 0) {
                    if (par_gh === 3) {
                        this.x += aa_sh * q[k];
                        this.z -= aa_sh * p[k];
                    } else {
                        this.xtemp += aa_sh * q[k];
                        this.ztemp -= aa_sh * p[k];
                    }
                    loc_l++;
                } else {
                    const bb_sh = rr * gh_arr[loc_l + 1];
                    const cc_sh = aa_sh * cl[loc_m] + bb_sh * sl[loc_m];

                    if (par_gh === 3) {
                        this.x += cc_sh * q[k];
                        this.z -= cc_sh * p[k];
                        if (loc_c_lat > 0) {
                            this.y += (aa_sh * sl[loc_m] - bb_sh * cl[loc_m]) * fm * p[k] / ((loc_fn + 1.0) * loc_c_lat);
                        } else {
                            this.y += (aa_sh * sl[loc_m] - bb_sh * cl[loc_m]) * q[k] * loc_s_lat;
                        }
                    } else {
                        this.xtemp += cc_sh * q[k];
                        this.ztemp -= cc_sh * p[k];
                        if (loc_c_lat > 0) {
                            this.ytemp += (aa_sh * sl[loc_m] - bb_sh * cl[loc_m]) * fm * p[k] / ((loc_fn + 1.0) * loc_c_lat);
                        } else {
                            this.ytemp += (aa_sh * sl[loc_m] - bb_sh * cl[loc_m]) * q[k] * loc_s_lat;
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
            const sn = 0.0001;
            if (par_gh === 3) {
                const h2 = this.x * this.x + this.y * this.y;
                this.h = Math.sqrt(h2);
                this.f = Math.sqrt(h2 + this.z * this.z);
                if (this.f < sn) {
                    this.d = NaN; this.i = NaN;
                } else {
                    this.i = Math.atan2(this.z, this.h);
                    if (this.h < sn) {
                        this.d = NaN;
                    } else {
                        const hpx = this.h + this.x;
                        if (hpx < sn) {
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
                if (this.ftemp < sn) {
                    this.dtemp = NaN; this.itemp = NaN;
                } else {
                    this.itemp = Math.atan2(this.ztemp, this.htemp);
                    if (this.htemp < sn) {
                        this.dtemp = NaN;
                    } else {
                        const hpx = this.htemp + this.xtemp;
                        if (hpx < sn) {
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
            let loc_model_I;
            for (loc_model_I = 0; loc_model_I < this.nmodel; loc_model_I++) {
                if (par_sdate < this.yrmax[loc_model_I]) break;
            }
            if (loc_model_I === this.nmodel) loc_model_I--;
            if (loc_model_I < 0 || loc_model_I >= this.nmodel || !this.irec_pos || !this.irec_pos[loc_model_I]) {
                return { d_deg: NaN, i_deg: NaN, f: NaN, h: NaN, x: NaN, y: NaN, z: NaN };
            }
            let loc_nmax;
            if (this.max2[loc_model_I] === 0) { // Interpolation
                if (loc_model_I + 1 >= this.nmodel || !this.irec_pos[loc_model_I + 1]) {
                    return { d_deg: NaN, i_deg: NaN, f: NaN, h: NaN, x: NaN, y: NaN, z: NaN };
                }
                this.getshc(1, this.irec_pos[loc_model_I], this.max1[loc_model_I], 1);
                this.getshc(1, this.irec_pos[loc_model_I + 1], this.max1[loc_model_I + 1], 2);
                loc_nmax = this.interpsh(par_sdate, this.yrmin[loc_model_I], this.max1[loc_model_I], this.yrmin[loc_model_I + 1], this.max1[loc_model_I + 1], 3);
            } else { // Extrapolation
                this.getshc(1, this.irec_pos[loc_model_I], this.max1[loc_model_I], 1);
                this.getshc(0, this.irec_pos[loc_model_I], this.max2[loc_model_I], 2);
                loc_nmax = this.extrapsh(par_sdate, this.epoch[loc_model_I], this.max1[loc_model_I], this.max2[loc_model_I], 3);
            }
            this.shval3(par_igdgc, par_lat, par_long, par_alt, loc_nmax, 3);
            this.dihf(3);
            const d_deg = this.d * K_RAD2DEG;
            const i_deg = this.i * K_RAD2DEG;
            let loc_final_x = this.x, final_y = this.y, final_d_deg = d_deg;
            if (Math.abs(90.0 - Math.abs(par_lat)) <= 0.001) {
                loc_final_x = NaN; final_y = NaN; final_d_deg = NaN;
            }
            return {
                modelName: this.model[loc_model_I],
                d_deg: final_d_deg, i_deg, h: this.h, x: loc_final_x, y: final_y, z: this.z, f: this.f
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

    function format_angle(angle) {
        if (Number.isNaN(angle)) return { deg: 'NaN', min: '' };
        let deg = Math.trunc(angle);
        let min = (angle - deg) * 60;
        if (angle > 0 && min >= 59.5) { min -= 60; deg++; }
        if (angle < 0 && min <= -59.5) { min += 60; deg--; }
        if (deg !== 0) min = Math.abs(min);
        return { deg, min: Math.round(min) };
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
        const fmt = v => Number.isNaN(v) ? '     NaN' : v.toFixed(1).padStart(8);
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
     * @param {Geomag} par_geomag - The geomag model instance.
     * @param {object} par_params - { sdate, igdgc, alt, latitude, longitude }
     * @returns {boolean} - true if successful, false otherwise.
     */
    function calculate_point(par_geomag, par_params) {
        const { sdate, igdgc, alt, latitude, longitude } = par_params;

        // Select the appropriate geomagnetic model based on the input date
        let loc_model_sI;
        for (loc_model_sI = 0; loc_model_sI < par_geomag.nmodel; loc_model_sI++) {
            if (sdate < par_geomag.yrmax[loc_model_sI]) break;
        }
        if (loc_model_sI === par_geomag.nmodel) loc_model_sI--;

        // Prepare spherical harmonic coefficients for the requested date:
        let loc_nmax;
        if (par_geomag.max2[loc_model_sI] === 0) { // Interpolation between two models
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_sI], par_geomag.max1[loc_model_sI], 1);
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_sI + 1], par_geomag.max1[loc_model_sI + 1], 2);
            loc_nmax = par_geomag.interpsh(sdate, par_geomag.yrmin[loc_model_sI], par_geomag.max1[loc_model_sI], par_geomag.yrmin[loc_model_sI + 1], par_geomag.max1[loc_model_sI + 1], 3);
            par_geomag.interpsh(sdate + 1, par_geomag.yrmin[loc_model_sI], par_geomag.max1[loc_model_sI], par_geomag.yrmin[loc_model_sI + 1], par_geomag.max1[loc_model_sI + 1], 4);
        } else { // Extrapolation using secular variation
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_sI], par_geomag.max1[loc_model_sI], 1);
            par_geomag.getshc(0, par_geomag.irec_pos[loc_model_sI], par_geomag.max2[loc_model_sI], 2);
            loc_nmax = par_geomag.extrapsh(sdate, par_geomag.epoch[loc_model_sI], par_geomag.max1[loc_model_sI], par_geomag.max2[loc_model_sI], 3);
            par_geomag.extrapsh(sdate + 1, par_geomag.epoch[loc_model_sI], par_geomag.max1[loc_model_sI], par_geomag.max2[loc_model_sI], 4);
        }

        // Calculate geomagnetic field vector components
        par_geomag.shval3(igdgc, latitude, longitude, alt, loc_nmax, 3); // for date
        par_geomag.dihf(3);
        par_geomag.shval3(igdgc, latitude, longitude, alt, loc_nmax, 4); // for date + 1 year
        par_geomag.dihf(4);

        // -- Output Results --
        // Convert radians to degrees for printing
        const d_deg = par_geomag.d * K_RAD2DEG;
        const i_deg = par_geomag.i * K_RAD2DEG;

        // Compute annual change (secular variation)
        let loc_d_dot = (par_geomag.dtemp - par_geomag.d) * K_RAD2DEG;
        if (loc_d_dot > 180.0) loc_d_dot -= 360.0;
        if (loc_d_dot <= -180.0) loc_d_dot += 360.0;
        loc_d_dot *= 60.0; // Convert to minutes/year

        const idot = (par_geomag.itemp - par_geomag.i) * K_RAD2DEG * 60.0;
        const hdot = par_geomag.htemp - par_geomag.h;
        const xdot = par_geomag.xtemp - par_geomag.x;
        const ydot = par_geomag.ytemp - par_geomag.y;
        const zdot = par_geomag.ztemp - par_geomag.z;
        const fdot = par_geomag.ftemp - par_geomag.f;

        // Handle special cases for printing
        let final_d_deg = d_deg;
        let final_x = par_geomag.x, final_y = par_geomag.y;
        let final_ddot = loc_d_dot;
        if (par_geomag.h < 100.0) { final_d_deg = NaN; final_ddot = NaN; }
        if (Math.abs(90.0 - Math.abs(latitude)) <= 0.001) {
            final_x = NaN; final_y = NaN; final_d_deg = NaN; final_ddot = NaN;
        }

        console.log(`\n\n\n  Model: ${par_geomag.model[loc_model_sI]}`);
        console.log(`  Latitude:  ${latitude.toFixed(2)} deg`);
        console.log(`  Longitude: ${longitude.toFixed(2)} deg`);
        console.log(`  Altitude:  ${alt.toFixed(2)} km`);
        console.log(`  Date:      ${sdate.toFixed(2)}\n`);

        print_header();
        print_result(sdate, final_d_deg, i_deg, par_geomag.h, final_x, final_y, par_geomag.z, par_geomag.f);
        print_long_dashed_line();
        print_header_sv();
        print_result_sv(sdate, final_ddot, idot, hdot, xdot, ydot, zdot, fdot);
        print_dashed_line();

        display_warnings(par_geomag, latitude);
        return true;
    }

    /**
     * Prompts user for parameters to calculate a single point.
     * @param {Geomag} par_geomag - The geomag model instance.
     */
    function calculateSinglePoint(par_geomag) {
        const { minyr, maxyr } = par_geomag;
        let sdate = -1, igdgc = -1, alt = -999999, latitude = 200, longitude = 200;

        while (sdate < minyr || sdate > maxyr + 1) {
            sdate = parseFloat(prompt(`Enter decimal date (${minyr.toFixed(2)} to ${maxyr.toFixed(0)}): `));
            if (sdate > maxyr && sdate < maxyr + 1) {
                console.log(`Warning: Date ${sdate.toFixed(2)} is out of range but within one year of model expiration.`);
            }
        }

        while (igdgc !== 1 && igdgc !== 2) {
            console.log("\nEnter Coordinate Preference:\n    1) Geodetic (WGS84)\n    2) Geocentric (spherical)");
            igdgc = parseInt(prompt("Selection ==> "));
        }

        const minalt_disp = igdgc === 2 ? par_geomag.altmin[0] + 6371.2 : par_geomag.altmin[0];
        const maxalt_disp = igdgc === 2 ? par_geomag.altmax[0] + 6371.2 : par_geomag.altmax[0];
        alt = parseFloat(prompt(`Enter altitude in km (${minalt_disp.toFixed(2)} to ${maxalt_disp.toFixed(2)}): `));

        while (latitude < -90 || latitude > 90) {
            latitude = parseFloat(prompt("Enter decimal latitude (-90 to 90): "));
        }

        while (longitude < -180 || longitude > 180) {
            longitude = parseFloat(prompt("Enter decimal longitude (-180 to 180): "));
        }

        calculate_point(par_geomag, {sdate, igdgc, alt, latitude, longitude});
    }

    // --- START: New functions for NOAA-style output ---

    /**
     * Prints a table of geomagnetic data formatted to match the ngdc.noaa.gov website style.
     * @param {Array<object>} par_results - Array of calculation result objects for each date.
     * @param {object} par_sv - Object containing the secular variation (annual change) data.
     * @param {object} par_loc_Info - Object with location and model details.
     */
    function printNOAAStyleTable(par_results, par_sv, par_loc_Info) {
        const { modelName, latitude, longitude, alt } = par_loc_Info;

        // Helper functions for formatting location
        const formatLat = (lat) => `${Math.abs(lat).toFixed(0)}° ${lat >= 0 ? 'N' : 'S'}`;
        const formatLon = (lon) => `${Math.abs(lon).toFixed(0)}° ${lon > 0 ? 'E' : 'W'}`;

        // --- Column Widths definitions (inner width, not including separators) ---
        const widths = {
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
        const totalTableWidth = Object.values(widths).reduce((sum, w) => sum + w + 1, 0);

        // --- Build Header Block ---
        console.log('\n' + '─'.repeat(totalTableWidth));
        console.log('Magnetic Field');
        console.log('─'.repeat(totalTableWidth));
        console.log(`Model Used:  ${modelName}`);
        console.log(`Latitude:    ${formatLat(latitude)}`);
        console.log(`Longitude:   ${formatLon(longitude)}`);
        console.log(`Elevation:   ${alt.toFixed(1)} km Mean Sea Level`);

        // --- Build Table Separator Line ---
        const hline = '+' + Object.values(widths).map(w => '─'.repeat(w)).join('+') + '+';
        console.log(hline);

        // --- Build Table Header ---
        const header1 = `| ${'Date'.padEnd(widths.date - 1)}` +
                        `| ${'Declination'.padEnd(widths.dec - 1)}` +
                        `| ${'Inclination'.padEnd(widths.inc - 1)}` +
                        `| ${'Horizontal'.padEnd(widths.h_int - 1)}` +
                        `| ${'North Comp'.padEnd(widths.north - 1)}` +
                        `| ${'East Comp'.padEnd(widths.east - 1)}` +
                        `| ${'Vertical Comp'.padEnd(widths.vert - 1)}` +
                        `| ${'Total Field'.padEnd(widths.total - 1)}|`;

        const header2 = `| ${''.padEnd(widths.date - 1)}` +
                        `| ${'( + E | - W )'.padEnd(widths.dec - 1)}` +
                        `| ${'( + D | - U)'.padEnd(widths.inc - 1)}` +
                        `| ${'Intensity'.padEnd(widths.h_int - 1)}` +
                        `| ${'( + N | - S )'.padEnd(widths.north - 1)}` +
                        `| ${'( + E | - W )'.padEnd(widths.east - 1)}` +
                        `| ${'( + D | - U )'.padEnd(widths.vert - 1)}` +
                        `| ${''.padEnd(widths.total - 1)}|`;

        console.log(header1);
        console.log(header2);
        console.log(hline);

        // --- Build Data Rows ---
        par_results.forEach(res => {
            const row = `| ${res.dateStr.padEnd(widths.date - 1)}` +
                        `|${(res.d_deg.toFixed(4) + '°').padStart(widths.dec)}` +
                        `|${(res.i_deg.toFixed(4) + '°').padStart(widths.inc)}` +
                        `|${(res.h.toFixed(1) + ' nT').padStart(widths.h_int)}` +
                        `|${(res.x.toFixed(1) + ' nT').padStart(widths.north)}` +
                        `|${(res.y.toFixed(1) + ' nT').padStart(widths.east)}` +
                        `|${(res.z.toFixed(1) + ' nT').padStart(widths.vert)}` +
                        `|${(res.f.toFixed(1) + ' nT').padStart(widths.total)}|`;
            console.log(row);
        });

        // --- Build Change/year Row ---
        const changeRow = `| ${'Change/year'.padEnd(widths.date - 1)}` +
                          `|${(par_sv.ddot_deg.toFixed(4) + '°/yr').padStart(widths.dec)}` +
                          `|${(par_sv.idot_deg.toFixed(4) + '°/yr').padStart(widths.inc)}` +
                          `|${(par_sv.hdot.toFixed(1) + ' nT/yr').padStart(widths.h_int)}` +
                          `|${(par_sv.xdot.toFixed(1) + ' nT/yr').padStart(widths.north)}` +
                          `|${(par_sv.ydot.toFixed(1) + ' nT/yr').padStart(widths.east)}` +
                          `|${(par_sv.zdot.toFixed(1) + ' nT/yr').padStart(widths.vert)}` +
                          `|${(par_sv.fdot.toFixed(1) + ' nT/yr').padStart(widths.total)}|`;
        console.log(changeRow);

        // --- Build Uncertainty Row --- #TODO понять как рассчитывать погрешность
        const uncertaintyRow = `| ${'Uncertainty'.padEnd(widths.date - 1)}` +
                               `|${'0.55°'.padStart(widths.dec)}` +
                               `|${'0.19°'.padStart(widths.inc)}` +
                               `|${'130 nT'.padStart(widths.h_int)}` +
                               `|${'135 nT'.padStart(widths.north)}` +
                               `|${'85 nT'.padStart(widths.east)}` +
                               `|${'134 nT'.padStart(widths.vert)}` +
                               `|${'134 nT'.padStart(widths.total)}|`;
        // console.log(uncertaintyRow);

        // --- Build Footer ---
        console.log(hline);
    }

    /**
     * Calculates only the main field components for a single date.
     * @returns {object} An object with the calculated field values.
     */
    function calculate_field_at_date(par_geomag, par_sdate, par_igdgc, par_alt, par_lat, par_long) {
        let loc_model_I;
        for (loc_model_I = 0; loc_model_I < par_geomag.nmodel; loc_model_I++) {
            if (par_sdate < par_geomag.yrmax[loc_model_I]) break;
        }
        if (loc_model_I === par_geomag.nmodel) loc_model_I--;

        let nmax;
        if (par_geomag.max2[loc_model_I] === 0) {
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_I], par_geomag.max1[loc_model_I], 1);
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_I + 1], par_geomag.max1[loc_model_I + 1], 2);
            nmax = par_geomag.interpsh(par_sdate, par_geomag.yrmin[loc_model_I], par_geomag.max1[loc_model_I], par_geomag.yrmin[loc_model_I + 1], par_geomag.max1[loc_model_I + 1], 3);
        } else {
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_I], par_geomag.max1[loc_model_I], 1);
            par_geomag.getshc(0, par_geomag.irec_pos[loc_model_I], par_geomag.max2[loc_model_I], 2);
            nmax = par_geomag.extrapsh(par_sdate, par_geomag.epoch[loc_model_I], par_geomag.max1[loc_model_I], par_geomag.max2[loc_model_I], 3);
        }

        par_geomag.shval3(par_igdgc, par_lat, par_long, par_alt, nmax, 3);
        par_geomag.dihf(3);

        const d_deg = par_geomag.d * K_RAD2DEG;
        const i_deg = par_geomag.i * K_RAD2DEG;
        let loc_final_x = par_geomag.x, final_y = par_geomag.y, final_d_deg = d_deg;

        if (Math.abs(90.0 - Math.abs(par_lat)) <= 0.001) {
            loc_final_x = NaN; final_y = NaN; final_d_deg = NaN;
        }

        return {
            modelName: par_geomag.model[loc_model_I],
            d_deg: final_d_deg, i_deg, h: par_geomag.h, x: loc_final_x, y: final_y, z: par_geomag.z, f: par_geomag.f
        };
    }

    /**
     * Calculates the secular variation (annual change) for a specific date.
     * @returns {object} An object with the calculated rates of change.
     */
    function get_secular_variation(par_geomag, par_params) {
        const { sdate, igdgc, alt, latitude, longitude } = par_params;

        let loc_model_I;
        for (loc_model_I = 0; loc_model_I < par_geomag.nmodel; loc_model_I++) {
            if (sdate < par_geomag.yrmax[loc_model_I]) break;
        }
        if (loc_model_I === par_geomag.nmodel) loc_model_I--;

        let nmax;
        if (par_geomag.max2[loc_model_I] === 0) {
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_I], par_geomag.max1[loc_model_I], 1);
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_I + 1], par_geomag.max1[loc_model_I + 1], 2);
            nmax = par_geomag.interpsh(sdate, par_geomag.yrmin[loc_model_I], par_geomag.max1[loc_model_I], par_geomag.yrmin[loc_model_I + 1], par_geomag.max1[loc_model_I + 1], 3);
            par_geomag.interpsh(sdate + 1, par_geomag.yrmin[loc_model_I], par_geomag.max1[loc_model_I], par_geomag.yrmin[loc_model_I + 1], par_geomag.max1[loc_model_I + 1], 4);
        } else {
            par_geomag.getshc(1, par_geomag.irec_pos[loc_model_I], par_geomag.max1[loc_model_I], 1);
            par_geomag.getshc(0, par_geomag.irec_pos[loc_model_I], par_geomag.max2[loc_model_I], 2);
            nmax = par_geomag.extrapsh(sdate, par_geomag.epoch[loc_model_I], par_geomag.max1[loc_model_I], par_geomag.max2[loc_model_I], 3);
            par_geomag.extrapsh(sdate + 1, par_geomag.epoch[loc_model_I], par_geomag.max1[loc_model_I], par_geomag.max2[loc_model_I], 4);
        }

        par_geomag.shval3(igdgc, latitude, longitude, alt, nmax, 3);
        par_geomag.dihf(3);
        par_geomag.shval3(igdgc, latitude, longitude, alt, nmax, 4);
        par_geomag.dihf(4);

        let loc_ddot_raw = (par_geomag.dtemp - par_geomag.d) * K_RAD2DEG;
        if (loc_ddot_raw > 180.0) loc_ddot_raw -= 360.0;
        if (loc_ddot_raw <= -180.0) loc_ddot_raw += 360.0;

        let loc_ddot_deg = loc_ddot_raw;
        const idot_deg = (par_geomag.itemp - par_geomag.i) * K_RAD2DEG;
        const hdot = par_geomag.htemp - par_geomag.h;
        let loc_xdot = par_geomag.xtemp - par_geomag.x;
        let loc_ydot = par_geomag.ytemp - par_geomag.y;
        const zdot = par_geomag.ztemp - par_geomag.z;
        const fdot = par_geomag.ftemp - par_geomag.f;

        if (Math.abs(90.0 - Math.abs(latitude)) <= 0.001) {
          loc_ddot_deg = NaN; loc_xdot = NaN; loc_ydot = NaN;
        }
        return { ddot_deg: loc_ddot_deg, idot_deg, hdot, xdot: loc_xdot, ydot: loc_ydot, zdot, fdot };
    }

    /**
     * Prompts user for parameters and calculates a range of dates, printing in NOAA format.
     * @param {Geomag} par_geomag - The geomag model instance.
     */
    function calculateDateRangeNOAA(par_geomag) {
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
            const sdate = par_geomag.julday(loc_month, loc_day, loc_year);
            const dateStr = `${loc_year}-${String(loc_month).padStart(2, '0')}-${String(loc_day).padStart(2, '0')}`;

            const pointGeomag = new Geomag();
            pointGeomag.modelData = par_geomag.modelData;
            Object.assign(pointGeomag, {
                 model: par_geomag.model, nmodel: par_geomag.nmodel, epoch: par_geomag.epoch,
                 yrmin: par_geomag.yrmin, yrmax: par_geomag.yrmax, altmin: par_geomag.altmin, altmax: par_geomag.altmax,
                 max1: par_geomag.max1, max2: par_geomag.max2, max3: par_geomag.max3, irec_pos: par_geomag.irec_pos
            });

            const data = calculate_field_at_date(pointGeomag, sdate, loc_igdgc, loc_alt, loc_lat, loc_long);
            if (!loc_model_name) loc_model_name = data.modelName;

            loc_results.push({ sdate, dateStr, ...data });
        }

        if (loc_results.length === 0) {
            console.log("No dates in the specified range. Nothing to calculate.");
            return;
        }

        const svGeomag = new Geomag();
        svGeomag.modelData = par_geomag.modelData;
        Object.assign(svGeomag, {
                model: par_geomag.model, nmodel: par_geomag.nmodel, epoch: par_geomag.epoch,
                yrmin: par_geomag.yrmin, yrmax: par_geomag.yrmax, altmin: par_geomag.altmin, altmax: par_geomag.altmax,
                max1: par_geomag.max1, max2: par_geomag.max2, max3: par_geomag.max3, irec_pos: par_geomag.irec_pos
        });
        const sv = get_secular_variation(svGeomag, { sdate: loc_results[0].sdate, igdgc: loc_igdgc, alt: loc_alt, latitude: loc_lat, longitude: loc_long });

        const locationInfo = { modelName: loc_model_name, latitude: loc_lat, longitude: loc_long, alt: loc_alt };
        printNOAAStyleTable(loc_results, sv, locationInfo);
    }
    // --- END: New functions for NOAA-style output ---

    /**
     * Main program execution: process inputs, perform geomagnetic calculations, and output results.
     */
    async function main() {
        const args = process.argv.slice(2);

        console.log("\n\nGeomag v7.0 (JavaScript port, v3) - Compatible with WMM and IGRF");

        if (args.length > 0) {
            await runFromArgs(args);
            return;
        }

        await runInteractive();
    }

    /**
     * Run program from command-line arguments and exit.
     */
    async function runFromArgs(par_args) {
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

        const geomag = new Geomag();
        if (!geomag.loadModelFile(par_args[0])) return;

        const dateArg = par_args[1];
        let loc_s_date;
        if (dateArg.includes(',')) {
            const parts = dateArg.split(',');
            loc_s_date = geomag.julday(parseInt(parts[1]), parseInt(parts[2]), parseInt(parts[0]));
        } else {
            loc_s_date = parseFloat(dateArg);
        }

        const igdgc = par_args[2].toUpperCase() === 'D' ? 1 : 2;
        const altArg = par_args[3];
        const unitChar = altArg.charAt(0).toUpperCase();
        let loc_alt = parseFloat(altArg.substring(1));
        if (unitChar === 'M') loc_alt *= 0.001;
        else if (unitChar === 'F') loc_alt /= K_FT2KM;

        const latitude = parseFloat(par_args[4]);
        const longitude = parseFloat(par_args[5]);

        calculate_point(geomag, { sdate: loc_s_date, igdgc, alt: loc_alt, latitude, longitude });
    }

    /**
     * Run program in interactive mode.
     */
    async function runInteractive() {
        const geomag = new Geomag();

        while(true) { // Outer loop for model selection
            let loc_mdfile = "";
            while(true) { // Loop until a valid model is loaded
                const cofFiles = fs.readdirSync('.').filter(f => f.toLowerCase().endsWith('.cof'));
                console.log("\n--- Model File Selection ---");
                if (cofFiles.length > 0) {
                    console.log('Available model files:');
                    cofFiles.forEach((f, i) => console.log(`  ${i + 1}) ${f}`));
                    let fileChoice = prompt('Select model file by number or enter filename: ');
                    if (/^\d+$/.test(fileChoice) && parseInt(fileChoice) >= 1 && parseInt(fileChoice) <= cofFiles.length) {
                        loc_mdfile = cofFiles[parseInt(fileChoice) - 1];
                    } else {
                        loc_mdfile = fileChoice;
                    }
                } else {
                    loc_mdfile = prompt("Enter the model data file name (e.g., IGRF14.COF): ");
                }

                if(geomag.loadModelFile(loc_mdfile)) {
                    console.log(`Model file "${loc_mdfile}" loaded successfully.`);
                    break; // Exit model selection loop
                }
            }

            let loc_stay_in_calc_loop = true;
            while(loc_stay_in_calc_loop) { // Inner loop for calculations
                console.log('\n--- Main Menu ---');
                console.log(`Model: ${geomag.mdfile} (Valid ${geomag.minyr.toFixed(1)}-${geomag.maxyr.toFixed(1)})`);
                console.log('1) Calculate field at a single point');
                console.log('2) Calculate field over a range of dates (NOAA format)');
                console.log('3) Load a different model file');
                console.log('0) Quit');
                const choice = prompt('Selection ==> ');

                switch(choice) {
                    case '1':
                        calculateSinglePoint(geomag);
                        break;
                    case '2':
                        calculateDateRangeNOAA(geomag);
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
        window.Geomag = Geomag;
    }
    // Only run main() in Node.js, not in browser
    if (typeof window === 'undefined') {
        main();
    }

    // Export CL_GEOMAG for module usage
    export { Geomag };
