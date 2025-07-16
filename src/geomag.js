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

    // --- Константы, перенесенные из C ---
    const FT2KM = 1.0 / 0.0003048;   // Conversion factor: feet to kilometers
    const RAD2DEG = 180.0 / Math.PI; // Conversion factor: radians to degrees
    const DTR = Math.PI / 180.0;     // Conversion factor: degrees to radians

    const MAXMOD = 30;
    const MAXDEG = 13;
    const MAXCOEFF = MAXDEG * (MAXDEG + 2) + 1; // +1 для 1-based индексации

    /**
     * Класс для инкапсуляции состояния и логики геомагнитной модели.
     */
    class Geomag {
        constructor() {
            this.gh1 = new Array(MAXCOEFF).fill(0);
            this.gh2 = new Array(MAXCOEFF).fill(0);
            this.gha = new Array(MAXCOEFF).fill(0);
            this.ghb = new Array(MAXCOEFF).fill(0);
            this.d = 0; this.f = 0; this.h = 0; this.i = 0;
            this.dtemp = 1; this.ftemp = 0; this.htemp = 0; this.itemp = 0;
            this.x = 0; this.y = 0; this.z = 0;
            this.xtemp = 0; this.ytemp = 0; this.ztemp = 0;
            this.epoch = new Array(MAXMOD).fill(0);
            this.yrmin = new Array(MAXMOD).fill(0);
            this.yrmax = new Array(MAXMOD).fill(0);
            this.altmin = new Array(MAXMOD).fill(0);
            this.altmax = new Array(MAXMOD).fill(0);
            this.max1 = new Array(MAXMOD).fill(0);
            this.max2 = new Array(MAXMOD).fill(0);
            this.max3 = new Array(MAXMOD).fill(0);
            this.model = Array.from({ length: MAXMOD }, () => "");
            this.irec_pos = new Array(MAXMOD).fill(0);
            this.modelData = null;
            this.nmodel = 0;
            this.minyr = 0;
            this.maxyr = 0;
            this.mdfile = "";
        }

        /**
         * Convert month, day, year to decimal year (fractional).
         */
        julday(month, day, year) {
            const days = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
            const leap_year = (((year % 4) === 0) && (((year % 100) !== 0) || ((year % 400) === 0)));
            const day_in_year = (days[month - 1] + day + (month > 2 && leap_year ? 1 : 0));
            return year + (day_in_year / (365.0 + (leap_year ? 1 : 0)));
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
                    if (modelI >= MAXMOD) {
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
        getshc(iflag, strec, nmax_of_gh, gh) {
            let line_num = strec;
            let ii = 0;

            for (let nn = 1; nn <= nmax_of_gh; nn++) {
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
                    const g = parseFloat(parts[iflag === 1 ? 2 : 4]);
                    const hh = parseFloat(parts[iflag === 1 ? 3 : 5]);

                    if (nn !== n || mm !== m) {
                        console.log(`Error: Corrupt record in model file at line ${line_num + 1}. Expected n=${nn}, m=${mm} but got n=${n}, m=${m}.`);
                        console.log(`Line content: "${line}"`);
                        process.exit(5);
                    }

                    ii++;
                    if (gh === 1) this.gh1[ii] = g;
                    else this.gh2[ii] = g;

                    if (m !== 0) {
                        ii++;
                        if (gh === 1) this.gh1[ii] = hh;
                        else this.gh2[ii] = hh;
                    }
                    line_num++;
                }
            }
        }

        /**
         * Extrapolate spherical harmonic coefficients based on secular variation for a given date.
         */
        extrapsh(date, dte1, nmax1, nmax2, gh) {
            let nmax;
            let k, l;
            const factor = date - dte1;

            if (nmax1 === nmax2) {
                k = nmax1 * (nmax1 + 2);
                nmax = nmax1;
            } else {
                if (nmax1 > nmax2) {
                    k = nmax2 * (nmax2 + 2);
                    l = nmax1 * (nmax1 + 2);
                    const target = (gh === 3) ? this.gha : this.ghb;
                    for (let ii = k + 1; ii <= l; ++ii) {
                        target[ii] = this.gh1[ii];
                    }
                    nmax = nmax1;
                } else {
                    k = nmax1 * (nmax1 + 2);
                    l = nmax2 * (nmax2 + 2);
                    const target = (gh === 3) ? this.gha : this.ghb;
                    for (let ii = k + 1; ii <= l; ++ii) {
                        target[ii] = factor * this.gh2[ii];
                    }
                    nmax = nmax2;
                }
            }

            const target = (gh === 3) ? this.gha : this.ghb;
            for (let ii = 1; ii <= k; ++ii) {
                target[ii] = this.gh1[ii] + factor * this.gh2[ii];
            }
            return nmax;
        }

        /**
         * Interpolate spherical harmonic coefficients between two model epochs.
         */
        interpsh(date, dte1, nmax1, dte2, nmax2, gh) {
            let nmax;
            let k, l;
            const factor = (date - dte1) / (dte2 - dte1);

            if (nmax1 === nmax2) {
                k = nmax1 * (nmax1 + 2);
                nmax = nmax1;
            } else {
                if (nmax1 > nmax2) {
                    k = nmax2 * (nmax2 + 2);
                    l = nmax1 * (nmax1 + 2);
                    const target = (gh === 3) ? this.gha : this.ghb;
                    for (let ii = k + 1; ii <= l; ++ii) {
                        target[ii] = this.gh1[ii] + factor * (-this.gh1[ii]);
                    }
                    nmax = nmax1;
                } else {
                    k = nmax1 * (nmax1 + 2);
                    l = nmax2 * (nmax2 + 2);
                    const target = (gh === 3) ? this.gha : this.ghb;
                    for (let ii = k + 1; ii <= l; ++ii) {
                        target[ii] = factor * this.gh2[ii];
                    }
                    nmax = nmax2;
                }
            }

            const target = (gh === 3) ? this.gha : this.ghb;
            for (let ii = 1; ii <= k; ++ii) {
                target[ii] = this.gh1[ii] + factor * (this.gh2[ii] - this.gh1[ii]);
            }
            return nmax;
        }

        /**
         * Compute geomagnetic field vector components (X, Y, Z) using spherical harmonics.
         */
        shval3(igdgc, flat, flon, elev, nmax, gh) {
            const earths_radius = 6371.2;
            const a2 = 40680631.59; /* WGS84 */
            const b2 = 40408299.98; /* WGS84 */
            const sl = new Array(14).fill(0);
            const cl = new Array(14).fill(0);
            const p = new Array(119).fill(0);
            const q = new Array(119).fill(0);

            let r = elev;
            let slat = Math.sin(flat * DTR);
            let clat;

            if (Math.abs(90.0 - flat) < 0.001) {
                clat = Math.cos(89.999 * DTR);
            } else if (Math.abs(90.0 + flat) < 0.001) {
                clat = Math.cos(-89.999 * DTR);
            } else {
                clat = Math.cos(flat * DTR);
            }

            sl[1] = Math.sin(flon * DTR);
            cl[1] = Math.cos(flon * DTR);

            if (gh === 3) {
                this.x = 0; this.y = 0; this.z = 0;
            } else {
                this.xtemp = 0; this.ytemp = 0; this.ztemp = 0;
            }

            let sd = 0.0;
            let cd = 1.0;
            let l = 1;
            let n = 0;
            let m = 1;
            const npq = (nmax * (nmax + 3)) / 2;

            if (igdgc === 1) {
                const aa_gd = a2 * clat * clat;
                const bb_gd = b2 * slat * slat;
                const cc_gd = aa_gd + bb_gd;
                const dd_gd = Math.sqrt(cc_gd);
                r = Math.sqrt(elev * (elev + 2.0 * dd_gd) + (a2 * aa_gd + b2 * bb_gd) / cc_gd);
                cd = (elev + dd_gd) / r;
                sd = (a2 - b2) / dd_gd * slat * clat / r;
                const aa_slat = slat;
                slat = slat * cd - clat * sd;
                clat = clat * cd + aa_slat * sd;
            }

            const ratio = earths_radius / r;
            const aa = Math.sqrt(3.0);
            p[1] = 2.0 * slat;
            p[2] = 2.0 * clat;
            p[3] = 4.5 * slat * slat - 1.5;
            p[4] = 3.0 * aa * clat * slat;
            q[1] = -clat;
            q[2] = slat;
            q[3] = -3.0 * clat * slat;
            q[4] = aa * (slat * slat - clat * clat);

            const gh_arr = (gh === 3) ? this.gha : this.ghb;
            let fn = 0;

            for (let k = 1; k <= npq; ++k) {
                if (n < m) {
                    m = 0;
                    n++;
                    fn = n;
                }
                const rr = Math.pow(ratio, n + 2);
                const fm = m;

                if (k >= 5) {
                    if (m === n) {
                        const aa_p = Math.sqrt(1.0 - 0.5 / fm);
                        const j = k - n - 1;
                        p[k] = (1.0 + 1.0 / fm) * aa_p * clat * p[j];
                        q[k] = aa_p * (clat * q[j] + slat / fm * p[j]);
                        sl[m] = sl[m - 1] * cl[1] + cl[m - 1] * sl[1];
                        cl[m] = cl[m - 1] * cl[1] - sl[m - 1] * sl[1];
                    } else {
                        const aa_p = Math.sqrt(fn * fn - fm * fm);
                        const bb_p = Math.sqrt(((fn - 1.0) * (fn - 1.0)) - (fm * fm)) / aa_p;
                        const cc_p = (2.0 * fn - 1.0) / aa_p;
                        const ii = k - n;
                        const j = k - 2 * n + 1;
                        p[k] = (fn + 1.0) * (cc_p * slat / fn * p[ii] - bb_p / (fn - 1.0) * p[j]);
                        q[k] = cc_p * (slat * q[ii] - clat / fn * p[ii]) - bb_p * q[j];
                    }
                }

                const aa_sh = rr * gh_arr[l];

                if (m === 0) {
                    if (gh === 3) {
                        this.x += aa_sh * q[k];
                        this.z -= aa_sh * p[k];
                    } else {
                        this.xtemp += aa_sh * q[k];
                        this.ztemp -= aa_sh * p[k];
                    }
                    l++;
                } else {
                    const bb_sh = rr * gh_arr[l + 1];
                    const cc_sh = aa_sh * cl[m] + bb_sh * sl[m];

                    if (gh === 3) {
                        this.x += cc_sh * q[k];
                        this.z -= cc_sh * p[k];
                        if (clat > 0) {
                            this.y += (aa_sh * sl[m] - bb_sh * cl[m]) * fm * p[k] / ((fn + 1.0) * clat);
                        } else {
                            this.y += (aa_sh * sl[m] - bb_sh * cl[m]) * q[k] * slat;
                        }
                    } else {
                        this.xtemp += cc_sh * q[k];
                        this.ztemp -= cc_sh * p[k];
                        if (clat > 0) {
                            this.ytemp += (aa_sh * sl[m] - bb_sh * cl[m]) * fm * p[k] / ((fn + 1.0) * clat);
                        } else {
                            this.ytemp += (aa_sh * sl[m] - bb_sh * cl[m]) * q[k] * slat;
                        }
                    }
                    l += 2;
                }
                m++;
            }

            const aa_final = (gh === 3) ? this.x : this.xtemp;
            const z_final = (gh === 3) ? this.z : this.ztemp;

            if (gh === 3) {
                this.x = aa_final * cd + z_final * sd;
                this.z = z_final * cd - aa_final * sd;
            } else {
                this.xtemp = aa_final * cd + z_final * sd;
                this.ztemp = z_final * cd - aa_final * sd;
            }
        }

        /**
         * Convert vector components to declination (D), inclination (I), horizontal (H), and total intensity (F).
         */
        dihf(gh) {
            const sn = 0.0001;
            if (gh === 3) {
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
         * @param {number} sdate - Decimal year (epoch).
         * @param {number} igdgc - 1 for Geodetic (WGS84), 2 for Geocentric.
         * @param {number} alt - Altitude in km.
         * @param {number} latitude - Latitude in degrees.
         * @param {number} longitude - Longitude in degrees.
         * @returns {object} Object with d_deg, i_deg, f: NaN, h: NaN, x: NaN, y: NaN, z: NaN };
         */
        getFieldComponents(sdate, igdgc, alt, latitude, longitude) {
            let modelI;
            for (modelI = 0; modelI < this.nmodel; modelI++) {
                if (sdate < this.yrmax[modelI]) break;
            }
            if (modelI === this.nmodel) modelI--;
            if (modelI < 0 || modelI >= this.nmodel || !this.irec_pos || !this.irec_pos[modelI]) {
                return { d_deg: NaN, i_deg: NaN, f: NaN, h: NaN, x: NaN, y: NaN, z: NaN };
            }
            let nmax;
            if (this.max2[modelI] === 0) { // Interpolation
                if (modelI + 1 >= this.nmodel || !this.irec_pos[modelI + 1]) {
                    return { d_deg: NaN, i_deg: NaN, f: NaN, h: NaN, x: NaN, y: NaN, z: NaN };
                }
                this.getshc(1, this.irec_pos[modelI], this.max1[modelI], 1);
                this.getshc(1, this.irec_pos[modelI + 1], this.max1[modelI + 1], 2);
                nmax = this.interpsh(sdate, this.yrmin[modelI], this.max1[modelI], this.yrmin[modelI + 1], this.max1[modelI + 1], 3);
            } else { // Extrapolation
                this.getshc(1, this.irec_pos[modelI], this.max1[modelI], 1);
                this.getshc(0, this.irec_pos[modelI], this.max2[modelI], 2);
                nmax = this.extrapsh(sdate, this.epoch[modelI], this.max1[modelI], this.max2[modelI], 3);
            }
            this.shval3(igdgc, latitude, longitude, alt, nmax, 3);
            this.dihf(3);
            const d_deg = this.d * RAD2DEG;
            const i_deg = this.i * RAD2DEG;
            let final_x = this.x, final_y = this.y, final_d_deg = d_deg;
            if (Math.abs(90.0 - Math.abs(latitude)) <= 0.001) {
                final_x = NaN; final_y = NaN; final_d_deg = NaN;
            }
            return {
                modelName: this.model[modelI],
                d_deg: final_d_deg, i_deg, h: this.h, x: final_x, y: final_y, z: this.z, f: this.f
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

    function print_result(date, d_deg, i_deg, h, x, y, z, f) {
        const d_ang = format_angle(d_deg), i_ang = format_angle(i_deg);
        const date_str = date.toFixed(2).padStart(7);
        const d_str = Number.isNaN(d_deg) ? '     NaN    ' : `${String(d_ang.deg).padStart(4)} ${String(d_ang.min).padStart(2)}'`;
        const i_str = `${String(i_ang.deg).padStart(4)} ${String(i_ang.min).padStart(2)}'`;
        console.log(`${date_str}  ${d_str}  ${i_str}  ${h.toFixed(1).padStart(8)} ${x.toFixed(1).padStart(8)} ${y.toFixed(1).padStart(8)} ${z.toFixed(1).padStart(8)} ${f.toFixed(1).padStart(8)}`);
    }

    function print_result_sv(date, dd, id, hd, xd, yd, zd, fd) {
        const date_str = date.toFixed(2).padStart(7);
        const fmt = v => Number.isNaN(v) ? '     NaN' : v.toFixed(1).padStart(8);
        console.log(`${date_str}  ${fmt(dd)}   ${fmt(id)}    ${fmt(hd)} ${fmt(xd)} ${fmt(yd)} ${fmt(zd)} ${fmt(fd)}`);
    }

    function display_warnings(geomag, latitude) {
        if (geomag.h < 5000.0 && geomag.h >= 1000.0) {
            console.log(`\nWarning: The horizontal field strength is only ${geomag.h.toFixed(1)} nT. Compass readings have large uncertainties.`);
        }
        if (geomag.h < 1000.0) {
            console.log(`\nWarning: The horizontal field strength is only ${geomag.h.toFixed(1)} nT. Compass readings have VERY LARGE uncertainties.`);
        }
        if (Math.abs(90.0 - Math.abs(latitude)) <= 0.001) {
            console.log("\nWarning: Location is at a geographic pole. X, Y, and declination are not computed.");
        }
    }

    // --- Core Calculation and Application Logic ---

    /**
     * Performs a single geomagnetic calculation for a given set of parameters.
     * @param {Geomag} geomag - The geomag model instance.
     * @param {object} params - { sdate, igdgc, alt, latitude, longitude }
     * @returns {boolean} - true if successful, false otherwise.
     */
    function calculate_point(geomag, params) {
        const { sdate, igdgc, alt, latitude, longitude } = params;

        // Select the appropriate geomagnetic model based on the input date
        let modelI;
        for (modelI = 0; modelI < geomag.nmodel; modelI++) {
            if (sdate < geomag.yrmax[modelI]) break;
        }
        if (modelI === geomag.nmodel) modelI--;

        // Prepare spherical harmonic coefficients for the requested date:
        let nmax;
        if (geomag.max2[modelI] === 0) { // Interpolation between two models
            geomag.getshc(1, geomag.irec_pos[modelI], geomag.max1[modelI], 1);
            geomag.getshc(1, geomag.irec_pos[modelI + 1], geomag.max1[modelI + 1], 2);
            nmax = geomag.interpsh(sdate, geomag.yrmin[modelI], geomag.max1[modelI], geomag.yrmin[modelI + 1], geomag.max1[modelI + 1], 3);
            geomag.interpsh(sdate + 1, geomag.yrmin[modelI], geomag.max1[modelI], geomag.yrmin[modelI + 1], geomag.max1[modelI + 1], 4);
        } else { // Extrapolation using secular variation
            geomag.getshc(1, geomag.irec_pos[modelI], geomag.max1[modelI], 1);
            geomag.getshc(0, geomag.irec_pos[modelI], geomag.max2[modelI], 2);
            nmax = geomag.extrapsh(sdate, geomag.epoch[modelI], geomag.max1[modelI], geomag.max2[modelI], 3);
            geomag.extrapsh(sdate + 1, geomag.epoch[modelI], geomag.max1[modelI], geomag.max2[modelI], 4);
        }

        // Calculate geomagnetic field vector components
        geomag.shval3(igdgc, latitude, longitude, alt, nmax, 3); // for date
        geomag.dihf(3);
        geomag.shval3(igdgc, latitude, longitude, alt, nmax, 4); // for date + 1 year
        geomag.dihf(4);

        // -- Output Results --
        // Convert radians to degrees for printing
        const d_deg = geomag.d * RAD2DEG;
        const i_deg = geomag.i * RAD2DEG;

        // Compute annual change (secular variation)
        let ddot = (geomag.dtemp - geomag.d) * RAD2DEG;
        if (ddot > 180.0) ddot -= 360.0;
        if (ddot <= -180.0) ddot += 360.0;
        ddot *= 60.0; // Convert to minutes/year

        const idot = (geomag.itemp - geomag.i) * RAD2DEG * 60.0;
        const hdot = geomag.htemp - geomag.h;
        const xdot = geomag.xtemp - geomag.x;
        const ydot = geomag.ytemp - geomag.y;
        const zdot = geomag.ztemp - geomag.z;
        const fdot = geomag.ftemp - geomag.f;

        // Handle special cases for printing
        let final_d_deg = d_deg;
        let final_x = geomag.x, final_y = geomag.y;
        let final_ddot = ddot;
        if (geomag.h < 100.0) { final_d_deg = NaN; final_ddot = NaN; }
        if (Math.abs(90.0 - Math.abs(latitude)) <= 0.001) {
            final_x = NaN; final_y = NaN; final_d_deg = NaN; final_ddot = NaN;
        }

        console.log(`\n\n\n  Model: ${geomag.model[modelI]}`);
        console.log(`  Latitude:  ${latitude.toFixed(2)} deg`);
        console.log(`  Longitude: ${longitude.toFixed(2)} deg`);
        console.log(`  Altitude:  ${alt.toFixed(2)} km`);
        console.log(`  Date:      ${sdate.toFixed(2)}\n`);

        print_header();
        print_result(sdate, final_d_deg, i_deg, geomag.h, final_x, final_y, geomag.z, geomag.f);
        print_long_dashed_line();
        print_header_sv();
        print_result_sv(sdate, final_ddot, idot, hdot, xdot, ydot, zdot, fdot);
        print_dashed_line();

        display_warnings(geomag, latitude);
        return true;
    }

    /**
     * Prompts user for parameters to calculate a single point.
     * @param {Geomag} geomag - The geomag model instance.
     */
    function calculateSinglePoint(geomag) {
        const { minyr, maxyr } = geomag;
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

        const minalt_disp = igdgc === 2 ? geomag.altmin[0] + 6371.2 : geomag.altmin[0];
        const maxalt_disp = igdgc === 2 ? geomag.altmax[0] + 6371.2 : geomag.altmax[0];
        alt = parseFloat(prompt(`Enter altitude in km (${minalt_disp.toFixed(2)} to ${maxalt_disp.toFixed(2)}): `));

        while (latitude < -90 || latitude > 90) {
            latitude = parseFloat(prompt("Enter decimal latitude (-90 to 90): "));
        }

        while (longitude < -180 || longitude > 180) {
            longitude = parseFloat(prompt("Enter decimal longitude (-180 to 180): "));
        }

        calculate_point(geomag, {sdate, igdgc, alt, latitude, longitude});
    }

    // --- START: New functions for NOAA-style output ---

    /**
     * Prints a table of geomagnetic data formatted to match the ngdc.noaa.gov website style.
     * @param {Array<object>} results - Array of calculation result objects for each date.
     * @param {object} sv - Object containing the secular variation (annual change) data.
     * @param {object} locationInfo - Object with location and model details.
     */
    function printNOAAStyleTable(results, sv, locationInfo) {
        const { modelName, latitude, longitude, alt } = locationInfo;

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
        results.forEach(res => {
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
                          `|${(sv.ddot_deg.toFixed(4) + '°/yr').padStart(widths.dec)}` +
                          `|${(sv.idot_deg.toFixed(4) + '°/yr').padStart(widths.inc)}` +
                          `|${(sv.hdot.toFixed(1) + ' nT/yr').padStart(widths.h_int)}` +
                          `|${(sv.xdot.toFixed(1) + ' nT/yr').padStart(widths.north)}` +
                          `|${(sv.ydot.toFixed(1) + ' nT/yr').padStart(widths.east)}` +
                          `|${(sv.zdot.toFixed(1) + ' nT/yr').padStart(widths.vert)}` +
                          `|${(sv.fdot.toFixed(1) + ' nT/yr').padStart(widths.total)}|`;
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
    function calculate_field_at_date(geomag, sdate, igdgc, alt, latitude, longitude) {
        let modelI;
        for (modelI = 0; modelI < geomag.nmodel; modelI++) {
            if (sdate < geomag.yrmax[modelI]) break;
        }
        if (modelI === geomag.nmodel) modelI--;

        let nmax;
        if (geomag.max2[modelI] === 0) {
            geomag.getshc(1, geomag.irec_pos[modelI], geomag.max1[modelI], 1);
            geomag.getshc(1, geomag.irec_pos[modelI + 1], geomag.max1[modelI + 1], 2);
            nmax = geomag.interpsh(sdate, geomag.yrmin[modelI], geomag.max1[modelI], geomag.yrmin[modelI + 1], geomag.max1[modelI + 1], 3);
        } else {
            geomag.getshc(1, geomag.irec_pos[modelI], geomag.max1[modelI], 1);
            geomag.getshc(0, geomag.irec_pos[modelI], geomag.max2[modelI], 2);
            nmax = geomag.extrapsh(sdate, geomag.epoch[modelI], geomag.max1[modelI], geomag.max2[modelI], 3);
        }

        geomag.shval3(igdgc, latitude, longitude, alt, nmax, 3);
        geomag.dihf(3);

        const d_deg = geomag.d * RAD2DEG;
        const i_deg = geomag.i * RAD2DEG;
        let final_x = geomag.x, final_y = geomag.y, final_d_deg = d_deg;

        if (Math.abs(90.0 - Math.abs(latitude)) <= 0.001) {
            final_x = NaN; final_y = NaN; final_d_deg = NaN;
        }

        return {
            modelName: geomag.model[modelI],
            d_deg: final_d_deg, i_deg, h: geomag.h, x: final_x, y: final_y, z: geomag.z, f: geomag.f
        };
    }

    /**
     * Calculates the secular variation (annual change) for a specific date.
     * @returns {object} An object with the calculated rates of change.
     */
    function get_secular_variation(geomag, params) {
        const { sdate, igdgc, alt, latitude, longitude } = params;

        let modelI;
        for (modelI = 0; modelI < geomag.nmodel; modelI++) {
            if (sdate < geomag.yrmax[modelI]) break;
        }
        if (modelI === geomag.nmodel) modelI--;

        let nmax;
        if (geomag.max2[modelI] === 0) {
            geomag.getshc(1, geomag.irec_pos[modelI], geomag.max1[modelI], 1);
            geomag.getshc(1, geomag.irec_pos[modelI + 1], geomag.max1[modelI + 1], 2);
            nmax = geomag.interpsh(sdate, geomag.yrmin[modelI], geomag.max1[modelI], geomag.yrmin[modelI + 1], geomag.max1[modelI + 1], 3);
            geomag.interpsh(sdate + 1, geomag.yrmin[modelI], geomag.max1[modelI], geomag.yrmin[modelI + 1], geomag.max1[modelI + 1], 4);
        } else {
            geomag.getshc(1, geomag.irec_pos[modelI], geomag.max1[modelI], 1);
            geomag.getshc(0, geomag.irec_pos[modelI], geomag.max2[modelI], 2);
            nmax = geomag.extrapsh(sdate, geomag.epoch[modelI], geomag.max1[modelI], geomag.max2[modelI], 3);
            geomag.extrapsh(sdate + 1, geomag.epoch[modelI], geomag.max1[modelI], geomag.max2[modelI], 4);
        }

        geomag.shval3(igdgc, latitude, longitude, alt, nmax, 3);
        geomag.dihf(3);
        geomag.shval3(igdgc, latitude, longitude, alt, nmax, 4);
        geomag.dihf(4);

        let ddot_raw = (geomag.dtemp - geomag.d) * RAD2DEG;
        if (ddot_raw > 180.0) ddot_raw -= 360.0;
        if (ddot_raw <= -180.0) ddot_raw += 360.0;

        let ddot_deg = ddot_raw;
        const idot_deg = (geomag.itemp - geomag.i) * RAD2DEG;
        const hdot = geomag.htemp - geomag.h;
        let xdot = geomag.xtemp - geomag.x;
        let ydot = geomag.ytemp - geomag.y;
        const zdot = geomag.ztemp - geomag.z;
        const fdot = geomag.ftemp - geomag.f;

        if (Math.abs(90.0 - Math.abs(latitude)) <= 0.001) {
          ddot_deg = NaN; xdot = NaN; ydot = NaN;
        }
        return { ddot_deg, idot_deg, hdot, xdot, ydot, zdot, fdot };
    }

    /**
     * Prompts user for parameters and calculates a range of dates, printing in NOAA format.
     * @param {Geomag} geomag - The geomag model instance.
     */
    function calculateDateRangeNOAA(geomag) {
        console.log('\n--- Calculate Field for a Date Range (NOAA Format) ---');
        let startYear = parseInt(prompt('Enter start year (e.g. 2025): '));
        let endYear = parseInt(prompt('Enter end year (e.g. 2029): '));
        let step = parseInt(prompt('Enter step in years (e.g. 1): '));

        let month = parseInt(prompt('Enter month (1-12): '));
        let day = parseInt(prompt('Enter day (1-31): '));

        let igdgc = -1;
        while (igdgc !== 1 && igdgc !== 2) {
            console.log("\nEnter Coordinate Preference:\n    1) Geodetic (WGS84)\n    2) Geocentric (spherical)");
            igdgc = parseInt(prompt("Selection ==> "));
        }
        let alt = parseFloat(prompt('Enter altitude in km: '));
        let latitude = parseFloat(prompt('Enter decimal latitude (-90 to 90): '));
        let longitude = parseFloat(prompt('Enter decimal longitude (-180 to 180): '));
        console.log("Calculating...");

        let results = [];
        let modelName = '';

        // Note: The example image has one odd date (2028-06-30). This loop uses a fixed day/month for simplicity.
        // The logic can be extended to handle arrays of specific dates if needed.
        for (let year = startYear; year <= endYear; year += step) {
            const sdate = geomag.julday(month, day, year);
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            const pointGeomag = new Geomag();
            pointGeomag.modelData = geomag.modelData;
            Object.assign(pointGeomag, {
                 model: geomag.model, nmodel: geomag.nmodel, epoch: geomag.epoch,
                 yrmin: geomag.yrmin, yrmax: geomag.yrmax, altmin: geomag.altmin, altmax: geomag.altmax,
                 max1: geomag.max1, max2: geomag.max2, max3: geomag.max3, irec_pos: geomag.irec_pos
            });

            const data = calculate_field_at_date(pointGeomag, sdate, igdgc, alt, latitude, longitude);
            if (!modelName) modelName = data.modelName;

            results.push({ sdate, dateStr, ...data });
        }

        if (results.length === 0) {
            console.log("No dates in the specified range. Nothing to calculate.");
            return;
        }

        const svGeomag = new Geomag();
        svGeomag.modelData = geomag.modelData;
        Object.assign(svGeomag, {
                model: geomag.model, nmodel: geomag.nmodel, epoch: geomag.epoch,
                yrmin: geomag.yrmin, yrmax: geomag.yrmax, altmin: geomag.altmin, altmax: geomag.altmax,
                max1: geomag.max1, max2: geomag.max2, max3: geomag.max3, irec_pos: geomag.irec_pos
        });
        const sv = get_secular_variation(svGeomag, { sdate: results[0].sdate, igdgc, alt, latitude, longitude });

        const locationInfo = { modelName, latitude, longitude, alt };
        printNOAAStyleTable(results, sv, locationInfo);
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
    async function runFromArgs(args) {
        if (args.length === 1 && (args[0] === 'h' || args[0] === '?')) {
            console.log("\nUsage (command line): node geomag.js model_file date coord alt lat lon");
            console.log("Example: node geomag.js IGRF14.COF 2023.5 D K10 55.75 37.61");
            return;
        }
        if (args.length < 6) {
            console.log("Error: Not enough arguments provided for command-line execution.");
            console.log("Usage: node geomag.js model_file date coord alt lat lon");
            return;
        }

        const geomag = new Geomag();
        if (!geomag.loadModelFile(args[0])) return;

        const dateArg = args[1];
        let sdate;
        if (dateArg.includes(',')) {
            const parts = dateArg.split(',');
            sdate = geomag.julday(parseInt(parts[1]), parseInt(parts[2]), parseInt(parts[0]));
        } else {
            sdate = parseFloat(dateArg);
        }

        const igdgc = args[2].toUpperCase() === 'D' ? 1 : 2;
        const altArg = args[3];
        const unitChar = altArg.charAt(0).toUpperCase();
        let alt = parseFloat(altArg.substring(1));
        if (unitChar === 'M') alt *= 0.001;
        else if (unitChar === 'F') alt /= FT2KM;

        const latitude = parseFloat(args[4]);
        const longitude = parseFloat(args[5]);

        calculate_point(geomag, { sdate, igdgc, alt, latitude, longitude });
    }

    /**
     * Run program in interactive mode.
     */
    async function runInteractive() {
        const geomag = new Geomag();

        while(true) { // Outer loop for model selection
            let mdfile = "";
            while(true) { // Loop until a valid model is loaded
                const cofFiles = fs.readdirSync('.').filter(f => f.toLowerCase().endsWith('.cof'));
                console.log("\n--- Model File Selection ---");
                if (cofFiles.length > 0) {
                    console.log('Available model files:');
                    cofFiles.forEach((f, i) => console.log(`  ${i + 1}) ${f}`));
                    let fileChoice = prompt('Select model file by number or enter filename: ');
                    if (/^\d+$/.test(fileChoice) && parseInt(fileChoice) >= 1 && parseInt(fileChoice) <= cofFiles.length) {
                        mdfile = cofFiles[parseInt(fileChoice) - 1];
                    } else {
                        mdfile = fileChoice;
                    }
                } else {
                    mdfile = prompt("Enter the model data file name (e.g., IGRF14.COF): ");
                }

                if(geomag.loadModelFile(mdfile)) {
                    console.log(`Model file "${mdfile}" loaded successfully.`);
                    break; // Exit model selection loop
                }
            }

            let stayInCalcLoop = true;
            while(stayInCalcLoop) { // Inner loop for calculations
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
                        stayInCalcLoop = false; // Breaks inner loop to go to outer loop
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

    // At the end of the file, expose Geomag globally for browser
    if (typeof window !== 'undefined') {
        window.Geomag = Geomag;
    }
    // Only run main() in Node.js, not in browser
    if (typeof window === 'undefined') {
        main();
    }

    // Export Geomag for module usage
    export { Geomag };
