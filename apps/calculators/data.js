/* ==========================================================================
   data.js — calculator definitions for elvinpeters.com/apps/calculators/
   Every calculator is a pure object: inputs + a compute(v) function.
   Adding a calculator = adding one entry here, then `node build.js`.

   RULE: nothing in here may invent a number. Formulas are first-principles
   math, or statute that is cited in `assumptions`. Anything that depends on
   an annually-indexed tax table (income tax, CPP, EI) lives in tax-tables.js
   and is NOT shipped until the table has been verified against the source.
   ========================================================================== */

(function (root) {
  'use strict';

  /* ---------------- shared math helpers ---------------- */

  // Canadian mortgages compound semi-annually but are paid monthly/weekly.
  // Convert the posted annual rate to the effective rate per payment.
  function cadPeriodicRate(annualPct, perYear) {
    var j = annualPct / 100;
    return Math.pow(1 + j / 2, 2 / perYear) - 1;
  }

  // Most non-mortgage Canadian lending compounds at the payment frequency.
  function simplePeriodicRate(annualPct, perYear) {
    return annualPct / 100 / perYear;
  }

  // Level payment that amortizes P over n periods at periodic rate i.
  function payment(P, i, n) {
    if (n <= 0) return 0;
    if (i === 0) return P / n;
    return (P * i) / (1 - Math.pow(1 + i, -n));
  }

  // Walk an amortization schedule. Returns yearly aggregates + totals.
  function amortize(P, i, pmtAmt, perYear, maxPeriods) {
    var bal = P, totalInterest = 0, totalPaid = 0, periods = 0;
    var years = [], yrInt = 0, yrPrin = 0;
    var cap = maxPeriods || perYear * 60;

    while (bal > 0.005 && periods < cap) {
      var int = bal * i;
      var prin = Math.min(pmtAmt - int, bal);
      if (prin <= 0) return null;            // payment never covers interest
      bal -= prin; totalInterest += int; totalPaid += int + prin; periods++;
      yrInt += int; yrPrin += prin;
      if (periods % perYear === 0 || bal <= 0.005) {
        years.push({ year: Math.ceil(periods / perYear), interest: yrInt, principal: yrPrin, balance: bal });
        yrInt = 0; yrPrin = 0;
      }
    }
    return { balance: bal, totalInterest: totalInterest, totalPaid: totalPaid, periods: periods, years: years };
  }

  // Progressive bracket tax. brackets = [[upperBound, rate], ...] ascending.
  function bracketTax(amount, brackets) {
    var tax = 0, prev = 0;
    for (var k = 0; k < brackets.length; k++) {
      var cap = brackets[k][0], rate = brackets[k][1];
      if (amount <= prev) break;
      tax += (Math.min(amount, cap) - prev) * rate;
      prev = cap;
    }
    return tax;
  }

  var PER_YEAR = { monthly: 12, 'semi-monthly': 24, 'bi-weekly': 26, weekly: 52 };
  var PER_LABEL = {
    monthly: 'per month', 'semi-monthly': 'twice a month',
    'bi-weekly': 'every two weeks', weekly: 'per week',
    'accel-bi-weekly': 'every two weeks, accelerated'
  };

  /* ---------------- Ontario / Toronto land transfer tax ----------------
     Ontario LTT (Land Transfer Tax Act) and the Toronto Municipal Land
     Transfer Tax share the same first five bands; Toronto adds luxury bands
     above $2M. First-time-buyer rebates: ON $4,000, Toronto $4,475.        */

  var ON_LTT = [[55000, .005], [250000, .01], [400000, .015], [2000000, .02], [Infinity, .025]];
  var TO_LTT = [[55000, .005], [250000, .01], [400000, .015], [2000000, .02], [3000000, .025],
                [4000000, .035], [5000000, .045], [10000000, .055], [20000000, .065], [Infinity, .075]];

  /* ---------------- CMHC-style default insurance ----------------
     Premium bands by loan-to-value, and the statutory minimum down payment
     (5% of the first $500k, 10% of $500k–$1.5M, 20% above $1.5M).          */

  function minDownPayment(price) {
    if (price <= 500000) return price * .05;
    if (price <= 1500000) return 25000 + (price - 500000) * .10;
    return price * .20;
  }

  function insurancePremiumRate(ltv) {
    if (ltv > .95) return null;      // below the legal minimum down payment
    if (ltv > .90) return .0400;
    if (ltv > .85) return .0310;
    if (ltv > .80) return .0280;
    return 0;
  }

  /* ================================================================
     THE CALCULATORS
     ================================================================ */

  var CALCULATORS = [

    /* ---------------------------------------------------------------- */
    {
      slug: 'mortgage-payment',
      name: 'Canadian Mortgage Payment Calculator',
      short: 'Mortgage Payment',
      cat: 'Mortgage & Property',
      featured: true,
      blurb: 'Real Canadian mortgage math — semi-annual compounding, every payment frequency, and the CMHC premium folded in.',
      seoDesc: 'Free Canadian mortgage payment calculator using semi-annual compounding (the way Canadian lenders actually calculate). Monthly, bi-weekly and accelerated payments, CMHC premium, and a full amortization breakdown.',
      inputs: [
        { id: 'price', label: 'Purchase price', type: 'money', def: 850000, min: 50000, step: 5000 },
        { id: 'downPct', label: 'Down payment', type: 'pct', def: 20, min: 0, max: 100, step: .5 },
        { id: 'rate', label: 'Interest rate', type: 'pct', def: 4.79, min: 0, max: 25, step: .01 },
        { id: 'amort', label: 'Amortization', type: 'int', def: 25, min: 1, max: 30, unit: 'years' },
        { id: 'freq', label: 'Payment frequency', type: 'select', def: 'monthly',
          options: [
            { v: 'monthly', l: 'Monthly (12/yr)' },
            { v: 'semi-monthly', l: 'Semi-monthly (24/yr)' },
            { v: 'bi-weekly', l: 'Bi-weekly (26/yr)' },
            { v: 'accel-bi-weekly', l: 'Accelerated bi-weekly (26/yr)' },
            { v: 'weekly', l: 'Weekly (52/yr)' }
          ] }
      ],
      compute: function (v) {
        var down = v.price * v.downPct / 100;
        var minDown = minDownPayment(v.price);
        var base = v.price - down;
        var ltv = v.price > 0 ? base / v.price : 0;
        var premRate = insurancePremiumRate(ltv);
        var premium = premRate === null ? 0 : base * premRate;
        var principal = base + premium;

        var accel = v.freq === 'accel-bi-weekly';
        var perYear = accel ? 26 : PER_YEAR[v.freq];
        var n = Math.round(v.amort * perYear);

        var pay, i;
        if (accel) {
          // Accelerated bi-weekly = half the monthly payment, paid 26x a year.
          var im = cadPeriodicRate(v.rate, 12);
          pay = payment(principal, im, Math.round(v.amort * 12)) / 2;
          i = cadPeriodicRate(v.rate, 26);
        } else {
          i = cadPeriodicRate(v.rate, perYear);
          pay = payment(principal, i, n);
        }

        var sched = amortize(principal, i, pay, perYear, perYear * 60);
        var actualYears = sched ? sched.periods / perYear : v.amort;

        // Baseline monthly run, so accelerated payments can show what they save.
        var iM = cadPeriodicRate(v.rate, 12);
        var payM = payment(principal, iM, Math.round(v.amort * 12));
        var schedM = amortize(principal, iM, payM, 12, 720);

        var warnings = [];
        if (down < minDown - 0.5) {
          warnings.push({ level: 'bad', text: 'Below the legal minimum down payment of ' +
            fmtMoney(minDown) + ' for a ' + fmtMoney(v.price) + ' home (5% of the first $500K, 10% from $500K to $1.5M, 20% above $1.5M).' });
        }
        if (premRate > 0 && v.price > 1500000) {
          warnings.push({ level: 'bad', text: 'Homes over $1.5M are not eligible for mortgage default insurance — you need 20% down.' });
        }
        if (premRate > 0 && v.amort > 25) {
          warnings.push({ level: 'warn', text: 'Amortizations over 25 years on an insured mortgage are limited to first-time buyers and newly built homes.' });
        }

        var stats = [
          { label: 'Mortgage principal', value: principal, fmt: 'money' },
          { label: 'Down payment', value: down, fmt: 'money', note: fmtPct(v.downPct) + ' of price' },
          { label: 'Total interest', value: sched ? sched.totalInterest : 0, fmt: 'money' },
          { label: 'Total cost of borrowing', value: sched ? sched.totalPaid : 0, fmt: 'money' }
        ];
        if (premium > 0) {
          stats.splice(1, 0, { label: 'Default insurance premium', value: premium, fmt: 'money',
            note: fmtPct(premRate * 100) + ' of the loan, added to the mortgage' });
        }
        if (accel && schedM) {
          var saved = schedM.totalInterest - sched.totalInterest;
          stats.push({ label: 'Interest saved vs monthly', value: saved, fmt: 'money', good: true,
            note: 'and paid off ' + fmtYears(schedM.periods / 12 - actualYears) + ' sooner' });
        }

        return {
          hero: { label: 'Payment', value: pay, fmt: 'money', unit: PER_LABEL[v.freq] },
          warnings: warnings,
          stats: stats,
          chart: sched ? {
            type: 'area', stacked: true,
            title: 'Where each year of payments goes',
            xLabel: 'Year', yFmt: 'money0',
            x: sched.years.map(function (y) { return y.year; }),
            series: [
              { name: 'Principal', values: sched.years.map(function (y) { return y.principal; }) },
              { name: 'Interest', values: sched.years.map(function (y) { return y.interest; }) }
            ]
          } : null,
          table: sched ? {
            title: 'Balance by year',
            cols: ['Year', 'Principal paid', 'Interest paid', 'Balance remaining'],
            fmts: ['int', 'money', 'money', 'money'],
            rows: sched.years.map(function (y) { return [y.year, y.principal, y.interest, y.balance]; })
          } : null
        };
      },
      assumptions: [
        'Canadian mortgage interest is compounded semi-annually, not in advance — the periodic rate used here is (1 + annual/2)^(2/payments per year) − 1. US-built calculators usually compound monthly and will quote you a slightly higher payment.',
        'Default insurance premium bands: 4.00% of the loan for 5–9.99% down, 3.10% for 10–14.99%, 2.80% for 15–19.99%, none at 20% or more. The premium is added to the mortgage, and provincial sales tax on it (where it applies) is not.',
        'Minimum down payment: 5% of the first $500,000, 10% of the portion from $500,000 to $1,500,000, and 20% on any home priced above $1,500,000.',
        'Accelerated bi-weekly is calculated the way lenders do it: half the monthly payment, taken 26 times a year, which quietly adds one extra monthly payment per year.',
        'Property tax, condo fees, heat and insurance are not included — this is principal and interest only.'
      ],
      faq: [
        { q: 'Why is this different from an American mortgage calculator?',
          a: 'Canadian fixed-rate mortgages are compounded semi-annually by law, while US mortgages compound monthly. On a $700,000 mortgage the difference is real money — an American calculator will overstate your Canadian payment by roughly $20 to $40 a month.' },
        { q: 'Is accelerated bi-weekly actually worth it?',
          a: 'Yes, but not for the reason most people think. It works because you make 26 half-payments instead of 24, so you pay one extra monthly payment a year without noticing. Switch the frequency above and the calculator shows exactly what that saves you.' },
        { q: 'What is the mortgage default insurance premium?',
          a: 'If you put down less than 20%, your lender requires insurance that protects them if you default. You pay for it. The premium is usually added to the mortgage rather than paid up front, so you pay interest on it for the life of the loan.' }
      ]
    },

    /* ---------------------------------------------------------------- */
    {
      slug: 'mortgage-stress-test',
      name: 'Mortgage Stress Test & Affordability Calculator',
      short: 'Stress Test',
      cat: 'Mortgage & Property',
      featured: true,
      blurb: 'What a Canadian lender will actually approve — qualified at the stress-test rate against GDS and TDS limits.',
      seoDesc: 'Canadian mortgage stress test calculator. Find the maximum mortgage you qualify for under the OSFI B-20 rule using GDS and TDS ratios, at the greater of your rate plus 2% or 5.25%.',
      inputs: [
        { id: 'income', label: 'Gross household income', type: 'money', def: 165000, min: 0, step: 1000, hint: 'Before tax, all borrowers combined' },
        { id: 'down', label: 'Down payment available', type: 'money', def: 150000, min: 0, step: 5000 },
        { id: 'rate', label: 'Contract rate offered', type: 'pct', def: 4.79, min: 0, max: 25, step: .01 },
        { id: 'amort', label: 'Amortization', type: 'int', def: 25, min: 1, max: 30, unit: 'years' },
        { id: 'debts', label: 'Other monthly debt payments', type: 'money', def: 550, min: 0, step: 25, hint: 'Car loans, credit card minimums, student loans, lines of credit' },
        { id: 'tax', label: 'Annual property tax', type: 'money', def: 5200, min: 0, step: 100 },
        { id: 'condo', label: 'Monthly condo fees', type: 'money', def: 0, min: 0, step: 25 },
        { id: 'heat', label: 'Monthly heating', type: 'money', def: 150, min: 0, step: 10 }
      ],
      compute: function (v) {
        var qual = Math.max(v.rate + 2, 5.25);
        var i = cadPeriodicRate(qual, 12);
        var n = v.amort * 12;
        var monthlyIncome = v.income / 12;

        // Fixed housing costs that eat into the ratio before any mortgage.
        var otherHousing = v.tax / 12 + v.heat + v.condo * .5;

        // GDS 39%: housing costs only. TDS 44%: housing + all other debt.
        var gdsRoom = monthlyIncome * .39 - otherHousing;
        var tdsRoom = monthlyIncome * .44 - otherHousing - v.debts;
        var maxPmt = Math.max(0, Math.min(gdsRoom, tdsRoom));
        var binding = tdsRoom < gdsRoom ? 'TDS (44%)' : 'GDS (39%)';

        // Invert the payment formula to get the principal that payment supports.
        var maxMortgage = i === 0 ? maxPmt * n : maxPmt * (1 - Math.pow(1 + i, -n)) / i;

        // The down payment also caps the price, via the minimum-down rules.
        // Note the dead zone: the tiered 5/10 rule tops out at a $1.5M home
        // (which needs $125K down), and anything above $1.5M demands a full
        // 20%. So between $125K and $300K of down payment, the ceiling is
        // stuck at $1.5M no matter how much more you put down.
        var priceFromDown;
        if (v.down >= 300000) priceFromDown = v.down / .20;
        else if (v.down >= 125000) priceFromDown = 1500000;
        else if (v.down >= 25000) priceFromDown = 500000 + (v.down - 25000) / .10;
        else priceFromDown = v.down / .05;

        var maxPrice = Math.min(maxMortgage + v.down, priceFromDown);
        var mortgage = Math.max(0, maxPrice - v.down);

        // Restate at the real contract rate — what you'd actually pay.
        var iReal = cadPeriodicRate(v.rate, 12);
        var realPmt = payment(mortgage, iReal, n);

        var limitedByDown = priceFromDown < maxMortgage + v.down - 1;
        var gdsUsed = monthlyIncome > 0 ? (otherHousing + maxPmt) / monthlyIncome * 100 : 0;
        var tdsUsed = monthlyIncome > 0 ? (otherHousing + maxPmt + v.debts) / monthlyIncome * 100 : 0;

        var warnings = [];
        if (maxPmt <= 0) {
          warnings.push({ level: 'bad', text: 'Your existing debts and housing costs already use up the 44% TDS allowance — a lender would not approve a mortgage at this income.' });
        } else if (limitedByDown) {
          warnings.push({ level: 'warn', text: 'Your income supports more than your down payment does. The ceiling here is the minimum-down-payment rule, not the stress test.' });
        }

        return {
          hero: { label: 'Maximum purchase price', value: maxPrice, fmt: 'money0',
            unit: limitedByDown ? 'limited by your down payment' : 'limited by ' + binding },
          warnings: warnings,
          stats: [
            { label: 'Stress-test qualifying rate', value: qual, fmt: 'pct',
              note: v.rate + 2 > 5.25 ? 'your rate + 2%' : 'the 5.25% floor' },
            { label: 'Maximum mortgage', value: mortgage, fmt: 'money0' },
            { label: 'Payment they qualify you at', value: maxPmt, fmt: 'money', note: 'monthly, at ' + fmtPct(qual) },
            { label: 'Payment you would actually make', value: realPmt, fmt: 'money', good: true, note: 'monthly, at ' + fmtPct(v.rate) },
            { label: 'GDS used', value: Math.min(gdsUsed, 39), fmt: 'pct', note: 'limit 39%' },
            { label: 'TDS used', value: Math.min(tdsUsed, 44), fmt: 'pct', note: 'limit 44%' }
          ]
        };
      },
      assumptions: [
        'The stress test is the OSFI Guideline B-20 minimum qualifying rate: the greater of your contract rate plus 2 percentage points, or 5.25%.',
        'GDS (Gross Debt Service) caps housing costs at 39% of gross income. TDS (Total Debt Service) caps housing plus all other debt payments at 44%. Whichever binds first sets your limit.',
        'Housing costs counted: mortgage principal and interest, property tax, heating, and 50% of condo fees — the standard lender treatment.',
        'Down payment ceiling uses the minimum-down rules: 5% of the first $500,000, 10% to $1.5M, 20% above.',
        'Individual lenders apply their own overlays and some insured products use tighter ratios, so treat this as the outer edge of what is possible rather than a pre-approval.'
      ],
      faq: [
        { q: 'Does the stress test still apply if I have 20% down?',
          a: 'Yes. Uninsured mortgages at federally regulated lenders are covered by Guideline B-20 too. The rule bites regardless of your down payment — the only common escape is a provincially regulated lender such as a credit union, which sets its own policy.' },
        { q: 'Why is my real payment so much lower than the qualifying payment?',
          a: 'Because the stress test deliberately approves you for a payment you are not making. That gap is the buffer — it is what happens to your budget if rates are two points higher at renewal.' },
        { q: 'What counts as "other monthly debt"?',
          a: 'Car loans and leases, student loan payments, the minimum payment on every credit card, and roughly 3% of any line of credit balance. Lenders count the obligation, not what you actually pay.' }
      ]
    },

    /* ---------------------------------------------------------------- */
    {
      slug: 'land-transfer-tax-ontario',
      name: 'Ontario & Toronto Land Transfer Tax Calculator',
      short: 'Land Transfer Tax',
      cat: 'Mortgage & Property',
      featured: true,
      blurb: 'The closing cost that surprises everyone. Provincial plus the Toronto municipal tax, with first-time buyer rebates.',
      seoDesc: 'Calculate Ontario land transfer tax and the Toronto municipal land transfer tax on any purchase price, including the first-time home buyer rebates of $4,000 provincially and $4,475 in Toronto.',
      inputs: [
        { id: 'price', label: 'Purchase price', type: 'money', def: 850000, min: 0, step: 5000 },
        { id: 'toronto', label: 'Property is in the City of Toronto', type: 'toggle', def: true },
        { id: 'ftb', label: 'First-time home buyer', type: 'toggle', def: false }
      ],
      compute: function (v) {
        var on = bracketTax(v.price, ON_LTT);
        var to = v.toronto ? bracketTax(v.price, TO_LTT) : 0;
        var onRebate = v.ftb ? Math.min(4000, on) : 0;
        var toRebate = v.ftb && v.toronto ? Math.min(4475, to) : 0;
        var total = on + to - onRebate - toRebate;

        var stats = [
          { label: 'Ontario land transfer tax', value: on, fmt: 'money' }
        ];
        if (v.toronto) stats.push({ label: 'Toronto municipal land transfer tax', value: to, fmt: 'money' });
        if (onRebate) stats.push({ label: 'Ontario first-time buyer rebate', value: -onRebate, fmt: 'money', good: true });
        if (toRebate) stats.push({ label: 'Toronto first-time buyer rebate', value: -toRebate, fmt: 'money', good: true });
        stats.push({ label: 'Effective rate on the price', value: v.price ? total / v.price * 100 : 0, fmt: 'pct2' });

        return {
          hero: { label: 'Land transfer tax due on closing', value: total, fmt: 'money', unit: 'cash, on top of your down payment' },
          warnings: v.toronto && !v.ftb && v.price > 0 ? [{ level: 'warn',
            text: 'Buying in Toronto costs you this tax twice — once provincially, once municipally. The same house one street outside the city limit costs ' + fmtMoney(to) + ' less to close.' }] : [],
          stats: stats,
          table: {
            title: 'How the tax is built, band by band',
            cols: ['Portion of price', 'Ontario rate', 'Ontario tax'].concat(v.toronto ? ['Toronto rate', 'Toronto tax'] : []),
            fmts: ['text', 'text', 'money'].concat(v.toronto ? ['text', 'money'] : []),
            rows: bandRows(v.price, v.toronto)
          }
        };
      },
      assumptions: [
        'Ontario rates: 0.5% to $55,000, 1.0% to $250,000, 1.5% to $400,000, 2.0% to $2,000,000, and 2.5% above that on one- and two-unit residential properties.',
        'Toronto applies a municipal tax on the same first four bands, then luxury bands rising from 2.5% to 7.5% on residential purchases above $2,000,000.',
        'First-time buyer rebates: up to $4,000 provincially and up to $4,475 in Toronto. Both are refunds of tax paid, so they cannot exceed the tax owing.',
        'This is the tax only. Legal fees, title insurance, the home inspection, and adjustments are separate and typically add $2,000 to $4,000.',
        'Non-resident purchasers may also owe the Non-Resident Speculation Tax, which is not calculated here.'
      ],
      faq: [
        { q: 'When do I actually pay this?',
          a: 'On closing day, in cash, through your lawyer. It cannot be rolled into the mortgage. This is the single most common reason a first-time buyer comes up short at closing.' },
        { q: 'Do I qualify as a first-time buyer?',
          a: 'You must never have owned a home anywhere in the world, and your spouse must not have owned one while you were married or living together. You also have to be 18 or older and occupy the home within nine months.' },
        { q: 'Is the Toronto tax really charged on top of the Ontario one?',
          a: 'Yes. Toronto is the only Ontario municipality with this power. On an $850,000 home it roughly doubles your land transfer tax bill.' }
      ]
    },

    /* ---------------------------------------------------------------- */
    {
      slug: 'compound-interest',
      name: 'Compound Interest Calculator',
      short: 'Compound Interest',
      cat: 'Saving & Investing',
      featured: true,
      blurb: 'Watch the split between what you put in and what the compounding did. The second number takes longer than people expect.',
      seoDesc: 'Compound interest calculator with regular contributions. See your balance year by year and exactly how much of it is growth rather than your own deposits.',
      inputs: [
        { id: 'initial', label: 'Starting amount', type: 'money', def: 10000, min: 0, step: 500 },
        { id: 'contrib', label: 'Regular contribution', type: 'money', def: 500, min: 0, step: 50 },
        { id: 'freq', label: 'Contribution frequency', type: 'select', def: 'monthly',
          options: [{ v: 'monthly', l: 'Monthly' }, { v: 'bi-weekly', l: 'Bi-weekly' }, { v: 'weekly', l: 'Weekly' }, { v: 'annually', l: 'Annually' }] },
        { id: 'rate', label: 'Annual return', type: 'pct', def: 7, min: -20, max: 40, step: .1 },
        { id: 'years', label: 'Years', type: 'int', def: 25, min: 1, max: 60 }
      ],
      compute: function (v) {
        var perYear = v.freq === 'annually' ? 1 : PER_YEAR[v.freq];
        var i = v.rate / 100 / perYear;
        var bal = v.initial, contributed = v.initial;
        var xs = [0], balSeries = [v.initial], contribSeries = [v.initial];

        for (var y = 1; y <= v.years; y++) {
          for (var p = 0; p < perYear; p++) {
            bal = bal * (1 + i) + v.contrib;
            contributed += v.contrib;
          }
          xs.push(y); balSeries.push(bal); contribSeries.push(contributed);
        }
        var growth = bal - contributed;

        // The year growth-to-date first exceeds contributions-to-date.
        var crossover = null;
        for (var k = 1; k < balSeries.length; k++) {
          if (balSeries[k] - contribSeries[k] > contribSeries[k]) { crossover = xs[k]; break; }
        }

        return {
          hero: { label: 'Balance after ' + v.years + ' years', value: bal, fmt: 'money0' },
          stats: [
            { label: 'You contributed', value: contributed, fmt: 'money0' },
            { label: 'Compounding contributed', value: growth, fmt: 'money0', good: growth > 0 },
            { label: 'Growth as a share of the total', value: bal ? growth / bal * 100 : 0, fmt: 'pct' },
            crossover
              ? { label: 'Growth overtakes your deposits', value: crossover, fmt: 'int', unit: 'years in' }
              : { label: 'Growth overtakes your deposits', value: null, fmt: 'text', text: 'not within ' + v.years + ' years' }
          ],
          chart: {
            type: 'area', stacked: false,
            title: 'Balance vs. what you actually put in',
            xLabel: 'Year', yFmt: 'money0',
            x: xs,
            series: [
              { name: 'Total balance', values: balSeries },
              { name: 'Your contributions', values: contribSeries }
            ]
          }
        };
      },
      assumptions: [
        'Returns are applied at the same frequency as contributions, and each contribution is made at the end of the period.',
        'The return is a constant annual rate. Real markets do not behave this way — a 7% average with volatility ends up somewhere below a steady 7%.',
        'No tax, no fees, no inflation. A 2% management fee on a 7% return is not a 5% haircut on the fee, it is roughly a third of your final balance over 25 years.',
        'Figures are nominal. To think in today\'s dollars, subtract expected inflation from the return — a 7% return with 2% inflation is about 5% real.'
      ],
      faq: [
        { q: 'What return should I use?',
          a: 'For a broad equity index over long periods, 6–8% nominal is the range most planners use. For a balanced portfolio, 4–6%. For a savings account, use the actual posted rate. Anything above 10% is a forecast, not a plan.' },
        { q: 'Why does the growth line stay flat for so long?',
          a: 'Because compounding is multiplicative and your balance starts small. The first decade is almost entirely your own deposits. The curve only bends once the balance is large enough that the return on it exceeds what you can save.' }
      ]
    },

    /* ---------------------------------------------------------------- */
    {
      slug: 'loan-payment',
      name: 'Loan & Car Payment Calculator',
      short: 'Loan Payment',
      cat: 'Debt & Borrowing',
      blurb: 'Monthly payment, total interest, and what a longer term is really costing you.',
      seoDesc: 'Calculate the monthly payment and total interest on a car loan, personal loan, or line of credit, with a full year-by-year balance schedule.',
      inputs: [
        { id: 'amount', label: 'Amount borrowed', type: 'money', def: 35000, min: 0, step: 500 },
        { id: 'rate', label: 'Interest rate', type: 'pct', def: 8.99, min: 0, max: 60, step: .01 },
        { id: 'years', label: 'Term', type: 'num', def: 5, min: .5, max: 12, step: .5, unit: 'years' },
        { id: 'freq', label: 'Payment frequency', type: 'select', def: 'monthly',
          options: [{ v: 'monthly', l: 'Monthly' }, { v: 'semi-monthly', l: 'Semi-monthly' }, { v: 'bi-weekly', l: 'Bi-weekly' }, { v: 'weekly', l: 'Weekly' }] },
        { id: 'down', label: 'Down payment or trade-in', type: 'money', def: 0, min: 0, step: 500 }
      ],
      compute: function (v) {
        var P = Math.max(0, v.amount - v.down);
        var perYear = PER_YEAR[v.freq];
        var i = simplePeriodicRate(v.rate, perYear);
        var n = Math.round(v.years * perYear);
        var pay = payment(P, i, n);
        var sched = amortize(P, i, pay, perYear, perYear * 15);

        // Compare against a term two years shorter, to price the convenience.
        var shortYears = Math.max(1, v.years - 2);
        var shortPay = payment(P, i, Math.round(shortYears * perYear));
        var shortInterest = shortPay * Math.round(shortYears * perYear) - P;
        var extraCost = (sched ? sched.totalInterest : 0) - shortInterest;

        return {
          hero: { label: 'Payment', value: pay, fmt: 'money', unit: PER_LABEL[v.freq] },
          stats: [
            { label: 'Financed', value: P, fmt: 'money' },
            { label: 'Total interest', value: sched ? sched.totalInterest : 0, fmt: 'money' },
            { label: 'Total repaid', value: sched ? sched.totalPaid : 0, fmt: 'money' },
            { label: 'Interest as a share of what you borrowed', value: P ? (sched ? sched.totalInterest : 0) / P * 100 : 0, fmt: 'pct' },
            v.years > 1.5
              ? { label: 'Cost of stretching to ' + v.years + ' years', value: extraCost, fmt: 'money',
                  note: 'vs a ' + shortYears + '-year term at ' + fmtMoney(shortPay) + '/period' }
              : null
          ].filter(Boolean),
          chart: sched ? {
            type: 'area', stacked: true,
            title: 'Principal and interest per year',
            xLabel: 'Year', yFmt: 'money0',
            x: sched.years.map(function (y) { return y.year; }),
            series: [
              { name: 'Principal', values: sched.years.map(function (y) { return y.principal; }) },
              { name: 'Interest', values: sched.years.map(function (y) { return y.interest; }) }
            ]
          } : null
        };
      },
      assumptions: [
        'Interest compounds at the payment frequency, which is how most Canadian car loans, personal loans and lines of credit are written. Mortgages are the exception — use the mortgage calculator for those.',
        'Assumes a fixed rate and no missed or extra payments.',
        'Dealer financing often bundles fees into the amount financed. Enter the total you are signing for, not the sticker price.'
      ],
      faq: [
        { q: 'Should I take the longer term for the lower payment?',
          a: 'Look at the "cost of stretching" line. On a car, a longer term also means more months where you owe more than the vehicle is worth, which is the part that actually hurts if you need to sell.' },
        { q: 'What about 0% dealer financing?',
          a: 'Enter 0% and compare the total against the cash price minus whatever rebate you forfeit by taking the financing. The rebate you give up is the real interest rate in disguise.' }
      ]
    },

    /* ---------------------------------------------------------------- */
    {
      slug: 'debt-payoff',
      name: 'Debt Payoff Calculator — Avalanche vs Snowball',
      short: 'Debt Payoff',
      cat: 'Debt & Borrowing',
      featured: true,
      blurb: 'Two orders to pay off the same debts. One is cheaper, one is easier to stick with. See the actual gap.',
      seoDesc: 'Compare the debt avalanche and debt snowball methods on your real balances. See months to debt-free and total interest paid for each strategy.',
      inputs: [
        { id: 'debts', label: 'Your debts', type: 'debtlist',
          // Defaults deliberately rank differently by rate and by balance, so the
          // two methods actually diverge instead of coinciding.
          def: [
            { name: 'Credit card', balance: 14500, rate: 22.99, min: 360 },
            { name: 'Line of credit', balance: 9000, rate: 10.5, min: 150 },
            { name: 'Store card', balance: 2400, rate: 12.99, min: 75 }
          ] },
        { id: 'extra', label: 'Extra you can put toward debt each month', type: 'money', def: 400, min: 0, step: 25 }
      ],
      compute: function (v) {
        function run(order) {
          var d = v.debts.map(function (x) { return { name: x.name, bal: +x.balance, rate: +x.rate / 100 / 12, min: +x.min }; })
            .filter(function (x) { return x.bal > 0; });
          if (!d.length) return null;
          d.sort(order);
          var month = 0, interest = 0, freed = 0, cleared = [];
          var series = [];

          while (d.some(function (x) { return x.bal > .005; }) && month < 720) {
            month++;
            var pool = v.extra + freed;
            // Interest accrues on every outstanding balance before any payment lands.
            d.forEach(function (x) {
              if (x.bal <= .005) return;
              var accrued = x.bal * x.rate;
              x.bal += accrued; interest += accrued;
            });
            // Minimums first, in order.
            d.forEach(function (x) {
              if (x.bal <= .005) return;
              var p = Math.min(x.min, x.bal); x.bal -= p;
            });
            // Then the snowball pool onto the first surviving debt.
            for (var k = 0; k < d.length && pool > 0; k++) {
              if (d[k].bal <= .005) continue;
              var p2 = Math.min(pool, d[k].bal); d[k].bal -= p2; pool -= p2;
            }
            d.forEach(function (x) {
              if (x.bal <= .005 && !x.done) { x.done = true; freed += x.min; cleared.push({ name: x.name, month: month }); }
            });
            if (month % 3 === 0 || !d.some(function (x) { return x.bal > .005; })) {
              series.push({ m: month, total: d.reduce(function (s, x) { return s + Math.max(0, x.bal); }, 0) });
            }
          }
          return { months: month, interest: interest, cleared: cleared, series: series };
        }

        var avalanche = run(function (a, b) { return b.rate - a.rate; });   // highest rate first
        var snowball  = run(function (a, b) { return a.bal - b.bal; });     // smallest balance first
        if (!avalanche || !snowball) {
          return { hero: { label: 'Add a debt to get started', value: null, fmt: 'text', text: '—' }, stats: [] };
        }

        var saved = snowball.interest - avalanche.interest;
        var firstWinA = avalanche.cleared[0], firstWinS = snowball.cleared[0];
        var maxLen = Math.max(avalanche.series.length, snowball.series.length);
        var xs = [], av = [], sn = [];
        for (var k = 0; k < maxLen; k++) {
          xs.push(((avalanche.series[k] || snowball.series[k]).m / 12).toFixed(2));
          av.push(avalanche.series[k] ? avalanche.series[k].total : 0);
          sn.push(snowball.series[k] ? snowball.series[k].total : 0);
        }

        return {
          hero: { label: 'Debt-free in', value: avalanche.months, fmt: 'months', unit: 'using the avalanche method' },
          stats: [
            { label: 'Avalanche — total interest', value: avalanche.interest, fmt: 'money', good: true,
              note: 'highest rate first · ' + fmtMonths(avalanche.months) },
            { label: 'Snowball — total interest', value: snowball.interest, fmt: 'money',
              note: 'smallest balance first · ' + fmtMonths(snowball.months) },
            { label: 'Avalanche saves you', value: saved, fmt: 'money', good: saved > 0 },
            { label: 'First debt gone — avalanche', value: firstWinA ? firstWinA.month : 0, fmt: 'months', note: firstWinA ? firstWinA.name : '' },
            { label: 'First debt gone — snowball', value: firstWinS ? firstWinS.month : 0, fmt: 'months', note: firstWinS ? firstWinS.name : '' }
          ],
          chart: {
            type: 'line',
            title: 'Total balance remaining',
            xLabel: 'Year', yFmt: 'money0',
            x: xs,
            series: [
              { name: 'Avalanche', values: av },
              { name: 'Snowball', values: sn }
            ]
          }
        };
      },
      assumptions: [
        'Both methods assume you keep paying every minimum, and direct the extra amount plus every freed-up minimum at one target debt at a time.',
        'Interest is compounded monthly on the outstanding balance and applied before payments.',
        'Balances and rates are treated as fixed. Credit card minimums normally shrink as the balance falls; holding the minimum constant here means both methods are compared on identical terms.',
        'No new borrowing during the payoff period. Adding to a card you are paying down is what actually breaks either plan.'
      ],
      faq: [
        { q: 'Which method should I pick?',
          a: 'Avalanche is mathematically cheaper — always. Look at the gap above. If avalanche saves a few hundred dollars and snowball clears your first debt a year earlier, take the motivation. If the gap is thousands, take the math.' },
        { q: 'What about consolidating instead?',
          a: 'Consolidation only helps if the new rate is genuinely lower and you stop using the old credit. Run your consolidated balance through the loan calculator and compare the total interest to the avalanche number here.' }
      ]
    },

    /* ---------------------------------------------------------------- */
    {
      slug: 'rent-vs-buy',
      name: 'Rent vs Buy Calculator',
      short: 'Rent vs Buy',
      cat: 'Mortgage & Property',
      blurb: 'Buying is not automatically better. This compares total wealth at the end, including what renting lets you invest.',
      seoDesc: 'Rent vs buy calculator that compares net wealth after a set number of years, accounting for closing costs, maintenance, property tax, and the returns a renter earns by investing the difference.',
      inputs: [
        { id: 'price', label: 'Purchase price', type: 'money', def: 850000, min: 0, step: 10000 },
        { id: 'downPct', label: 'Down payment', type: 'pct', def: 20, min: 5, max: 100, step: 1 },
        { id: 'rate', label: 'Mortgage rate', type: 'pct', def: 4.79, min: 0, max: 20, step: .01 },
        { id: 'rent', label: 'Monthly rent for a comparable place', type: 'money', def: 3100, min: 0, step: 50 },
        { id: 'years', label: 'How long you stay', type: 'int', def: 10, min: 1, max: 40, unit: 'years' },
        { id: 'appreciation', label: 'Home appreciation', type: 'pct', def: 3, min: -10, max: 20, step: .1 },
        { id: 'invReturn', label: 'Return on invested savings', type: 'pct', def: 6, min: -10, max: 25, step: .1 },
        { id: 'rentInflation', label: 'Rent increases', type: 'pct', def: 2.5, min: 0, max: 20, step: .1 },
        { id: 'taxRate', label: 'Property tax rate', type: 'pct', def: .72, min: 0, max: 5, step: .01, hint: 'Toronto is around 0.72% of assessed value' },
        { id: 'maint', label: 'Maintenance & insurance', type: 'pct', def: 1.2, min: 0, max: 6, step: .1, hint: 'Per year, as a share of home value' }
      ],
      compute: function (v) {
        var down = v.price * v.downPct / 100;
        var mortgage = v.price - down;
        var i = cadPeriodicRate(v.rate, 12);
        var n = 25 * 12;
        var pmtAmt = payment(mortgage, i, n);
        var closing = v.price * .015 + bracketTax(v.price, ON_LTT);   // legal + title + LTT

        var bal = mortgage, homeVal = v.price;
        var rentNow = v.rent;
        var portfolio = down + closing;      // the renter invests what the buyer put down
        var xs = [0], buyerNet = [down + closing - closing], renterNet = [portfolio];
        var totalRent = 0, totalOwn = 0;

        for (var y = 1; y <= v.years; y++) {
          for (var m = 0; m < 12; m++) {
            var int = bal * i;
            bal = Math.max(0, bal - (pmtAmt - int));
            var ownCost = pmtAmt + homeVal * (v.taxRate + v.maint) / 100 / 12;
            totalOwn += ownCost; totalRent += rentNow;
            // The renter invests the monthly difference, when there is one.
            portfolio = portfolio * (1 + v.invReturn / 100 / 12) + Math.max(0, ownCost - rentNow);
          }
          homeVal *= 1 + v.appreciation / 100;
          rentNow *= 1 + v.rentInflation / 100;
          xs.push(y);
          buyerNet.push(homeVal * .95 - bal);       // net of ~5% selling costs
          renterNet.push(portfolio);
        }

        var buyerFinal = buyerNet[buyerNet.length - 1];
        var renterFinal = renterNet[renterNet.length - 1];
        var edge = buyerFinal - renterFinal;

        // Find the year buying pulls ahead, if it does.
        var breakeven = null;
        for (var k = 1; k < buyerNet.length; k++) { if (buyerNet[k] > renterNet[k]) { breakeven = xs[k]; break; } }

        return {
          hero: {
            label: edge >= 0 ? 'Buying comes out ahead by' : 'Renting comes out ahead by',
            value: Math.abs(edge), fmt: 'money0', unit: 'after ' + v.years + ' years'
          },
          stats: [
            { label: 'Buyer net worth', value: buyerFinal, fmt: 'money0', note: 'home value less mortgage and selling costs' },
            { label: 'Renter net worth', value: renterFinal, fmt: 'money0', note: 'invested down payment plus monthly savings' },
            { label: 'Upfront cash to buy', value: down + closing, fmt: 'money0', note: 'down payment plus ' + fmtMoney(closing) + ' closing' },
            { label: 'Total paid to own', value: totalOwn, fmt: 'money0' },
            { label: 'Total paid in rent', value: totalRent, fmt: 'money0' },
            breakeven
              ? { label: 'Buying pulls ahead', value: breakeven, fmt: 'int', unit: 'years in', good: true }
              : { label: 'Buying pulls ahead', value: null, fmt: 'text', text: 'not within ' + v.years + ' years' }
          ],
          chart: {
            type: 'line',
            title: 'Net worth over time',
            xLabel: 'Year', yFmt: 'money0',
            x: xs,
            series: [
              { name: 'Buy', values: buyerNet },
              { name: 'Rent & invest', values: renterNet }
            ]
          }
        };
      },
      assumptions: [
        'The renter is assumed to invest the full upfront cost of buying, plus the monthly difference whenever owning costs more than renting. If that money gets spent instead, buying wins far more easily.',
        'Closing costs on purchase are estimated at 1.5% of price plus Ontario land transfer tax. Toronto\'s municipal tax is not included here — add it for a Toronto purchase.',
        'Selling costs are taken at 5% of the home\'s value in the final year, covering commission and legal fees.',
        'Mortgage is amortized over 25 years at a constant rate, with no renewal shock.',
        'Principal residence capital gains are tax-free in Canada; investment returns are shown before tax, which flatters the renter unless the money sits in a TFSA or RRSP.'
      ],
      faq: [
        { q: 'Why does the answer flip so easily?',
          a: 'Because it hinges on two guesses: home appreciation and investment return. Move either by a point and the winner changes. That is the real lesson — anyone telling you renting is throwing money away is quietly assuming a number.' },
        { q: 'What if I plan to stay only a few years?',
          a: 'Short stays almost always favour renting. Land transfer tax, legal fees, and commission are roughly 6–8% of the price round-trip, and appreciation needs years to cover that.' }
      ]
    },

    /* ---------------------------------------------------------------- */
    {
      slug: 'savings-goal',
      name: 'Savings Goal Calculator',
      short: 'Savings Goal',
      cat: 'Saving & Investing',
      blurb: 'Name a number and a deadline. This tells you what it costs per month, and what happens if you start a year late.',
      seoDesc: 'Work out the monthly contribution needed to reach a savings goal by a target date, including the return on what you have already saved.',
      inputs: [
        { id: 'goal', label: 'Savings goal', type: 'money', def: 100000, min: 0, step: 1000 },
        { id: 'have', label: 'Already saved', type: 'money', def: 12000, min: 0, step: 500 },
        { id: 'years', label: 'Years to reach it', type: 'num', def: 8, min: .5, max: 50, step: .5 },
        { id: 'rate', label: 'Annual return', type: 'pct', def: 4.5, min: -10, max: 30, step: .1 }
      ],
      compute: function (v) {
        var i = v.rate / 100 / 12, n = Math.max(1, Math.round(v.years * 12));
        var fvHave = v.have * Math.pow(1 + i, n);
        var need = Math.max(0, v.goal - fvHave);
        var monthly = i === 0 ? need / n : need * i / (Math.pow(1 + i, n) - 1);

        // The cost of starting twelve months later.
        var nLate = Math.max(1, n - 12);
        var fvHaveLate = v.have * Math.pow(1 + i, nLate);
        var needLate = Math.max(0, v.goal - fvHaveLate);
        var monthlyLate = i === 0 ? needLate / nLate : needLate * i / (Math.pow(1 + i, nLate) - 1);

        var xs = [], bal = [];
        var b = v.have;
        for (var y = 0; y <= Math.ceil(v.years); y++) {
          xs.push(y); bal.push(b);
          for (var m = 0; m < 12; m++) b = b * (1 + i) + monthly;
        }

        return {
          hero: { label: 'Set aside', value: monthly, fmt: 'money', unit: 'every month' },
          stats: [
            { label: 'Total you will contribute', value: monthly * n, fmt: 'money0' },
            { label: 'Growth on the way', value: Math.max(0, v.goal - v.have - monthly * n), fmt: 'money0', good: true },
            { label: 'What your current savings grow to', value: fvHave, fmt: 'money0', note: 'without adding anything' },
            { label: 'If you start a year late', value: monthlyLate, fmt: 'money',
              note: fmtMoney(monthlyLate - monthly) + ' more per month, forever' }
          ],
          chart: { type: 'line', title: 'Balance on track', xLabel: 'Year', yFmt: 'money0',
            x: xs, series: [{ name: 'Balance', values: bal }] }
        };
      },
      assumptions: [
        'Contributions are made at the end of each month and the return is applied monthly.',
        'The return is constant. For a goal under three years, use a savings-account or GIC rate rather than a market return — you cannot afford a bad year on a short deadline.',
        'Figures are before tax and inflation.'
      ],
      faq: [
        { q: 'The monthly number is impossible. Now what?',
          a: 'Three levers, in order of how much they move: extend the deadline, lower the goal, raise the return. The first two are under your control and the third mostly is not.' }
      ]
    },

    /* ---------------------------------------------------------------- */
    {
      slug: 'ad-spend-roi',
      name: 'Ad Spend ROI & Break-Even Calculator',
      short: 'Ad Spend ROI',
      cat: 'Business & Marketing',
      featured: true,
      blurb: 'The four numbers that decide whether a campaign is a business or a hobby: CAC, ROAS, payback, and the CPA you can actually afford.',
      seoDesc: 'Calculate return on ad spend, cost per acquisition, customer lifetime value, and the break-even CPA for any paid campaign. Built by a veteran Google Ads specialist.',
      inputs: [
        { id: 'spend', label: 'Monthly ad spend', type: 'money', def: 6000, min: 0, step: 250 },
        { id: 'cpc', label: 'Average cost per click', type: 'money', def: 2.40, min: .01, step: .05 },
        { id: 'cvr', label: 'Click-to-lead rate', type: 'pct', def: 4.5, min: .01, max: 100, step: .1 },
        { id: 'close', label: 'Lead-to-customer rate', type: 'pct', def: 22, min: .01, max: 100, step: .5 },
        { id: 'aov', label: 'Average order value', type: 'money', def: 850, min: 0, step: 25 },
        { id: 'margin', label: 'Gross margin', type: 'pct', def: 60, min: 0, max: 100, step: 1 },
        { id: 'repeat', label: 'Purchases per customer', type: 'num', def: 2.4, min: 1, max: 100, step: .1, hint: 'Over their whole lifetime' }
      ],
      compute: function (v) {
        var clicks = v.cpc > 0 ? v.spend / v.cpc : 0;
        var leads = clicks * v.cvr / 100;
        var customers = leads * v.close / 100;
        var cpl = leads > 0 ? v.spend / leads : 0;
        var cac = customers > 0 ? v.spend / customers : 0;

        var firstRevenue = customers * v.aov;
        var ltv = v.aov * v.repeat;
        var ltvGross = ltv * v.margin / 100;
        var roas = v.spend > 0 ? firstRevenue / v.spend : 0;
        var profit = customers * ltvGross - v.spend;
        var ratio = cac > 0 ? ltvGross / cac : 0;
        var breakEvenCPA = v.aov * v.margin / 100;
        var paybackOrders = breakEvenCPA > 0 ? cac / breakEvenCPA : 0;

        var level = ratio >= 3 ? 'good' : ratio >= 1 ? 'warn' : 'bad';
        var warnings = [];
        if (ratio < 1 && customers > 0) {
          warnings.push({ level: 'bad', text: 'You are paying ' + fmtMoney(cac) + ' to acquire a customer worth ' + fmtMoney(ltvGross) + ' in gross profit. This campaign loses money on every sale.' });
        } else if (ratio < 3 && ratio >= 1) {
          warnings.push({ level: 'warn', text: 'An LTV:CAC ratio of ' + ratio.toFixed(1) + ':1 is thin. The usual health threshold is 3:1 — below that there is nothing left to fund overhead and growth.' });
        }
        if (customers < 1) {
          warnings.push({ level: 'warn', text: 'At this spend you buy fewer than one customer a month, so the numbers above are averages you will not actually experience. Raise the budget or lower the cost per click before drawing conclusions.' });
        }

        return {
          hero: { label: 'Cost to acquire a customer', value: cac, fmt: 'money', unit: 'against ' + fmtMoney(ltvGross) + ' of lifetime gross profit' },
          warnings: warnings,
          stats: [
            { label: 'LTV : CAC', value: ratio, fmt: 'ratio', good: level === 'good', bad: level === 'bad', note: 'healthy is 3:1 or better' },
            { label: 'Monthly gross profit after ad spend', value: profit, fmt: 'money0', good: profit > 0, bad: profit < 0 },
            { label: 'ROAS on first purchase', value: roas, fmt: 'x', note: fmtMoney(firstRevenue) + ' revenue on ' + fmtMoney(v.spend) },
            { label: 'Break-even CPA', value: breakEvenCPA, fmt: 'money', note: 'the most you can pay per customer and still be even on order one' },
            { label: 'Orders to pay back acquisition', value: paybackOrders, fmt: 'dec1', unit: 'orders' },
            { label: 'Clicks / leads / customers', value: null, fmt: 'text',
              text: Math.round(clicks).toLocaleString() + ' → ' + Math.round(leads).toLocaleString() + ' → ' + customers.toFixed(1) },
            { label: 'Cost per lead', value: cpl, fmt: 'money' }
          ],
          chart: {
            type: 'funnel', fmt: 'dec1',
            title: 'Where the budget goes',
            steps: [
              { name: 'Clicks', value: clicks },
              { name: 'Leads', value: leads },
              { name: 'Customers', value: customers }
            ]
          }
        };
      },
      assumptions: [
        'Gross margin is applied to lifetime revenue before comparing against acquisition cost. Comparing CAC to revenue rather than gross profit is the single most common way a campaign looks profitable and is not.',
        'Lifetime value here is average order value multiplied by purchases per customer. It carries no discount rate, so long repeat cycles are flattered.',
        'Ad spend is the only cost included. Agency fees, creative production, and tool subscriptions are not — add them to spend if you want the true picture.',
        'Conversion rates are treated as constants. In practice they fall as you scale spend, because the cheapest, highest-intent traffic gets bought first.'
      ],
      faq: [
        { q: 'What is a good LTV:CAC ratio?',
          a: 'Three to one is the standard benchmark for a healthy business. Below one you lose money on every customer. Far above five and you are probably underspending — there is profitable volume you are leaving on the table.' },
        { q: 'Should I use revenue or profit for LTV?',
          a: 'Gross profit, always. If your margin is 30%, a customer worth $1,000 in revenue is worth $300 to the business, and paying $400 to acquire them is a slow way to go broke.' },
        { q: 'My conversion rate drops when I raise budget. Is that normal?',
          a: 'Completely. Platforms serve your cheapest, highest-intent audience first. Model the scaled campaign with a lower conversion rate and a higher cost per click, not the numbers from your current spend.' }
      ]
    },

    /* ---------------------------------------------------------------- */
    {
      slug: 'freelance-rate',
      name: 'Freelance Hourly Rate Calculator',
      short: 'Freelance Rate',
      cat: 'Business & Marketing',
      blurb: 'Work backwards from the income you need to the rate you have to charge. Most freelancers undercharge by about 40%.',
      seoDesc: 'Calculate the hourly rate a freelancer or consultant needs to charge, accounting for unbillable time, vacation, business expenses, and self-employment tax.',
      inputs: [
        { id: 'target', label: 'Take-home income you want', type: 'money', def: 110000, min: 0, step: 5000, hint: 'What you want to actually keep, after tax' },
        { id: 'taxPct', label: 'Effective tax rate', type: 'pct', def: 30, min: 0, max: 60, step: 1, hint: 'Income tax plus CPP on self-employment' },
        { id: 'expenses', label: 'Annual business expenses', type: 'money', def: 9000, min: 0, step: 500, hint: 'Software, insurance, accounting, equipment' },
        { id: 'weeks', label: 'Weeks worked per year', type: 'int', def: 46, min: 1, max: 52, hint: '52 minus vacation, holidays and sick days' },
        { id: 'hours', label: 'Hours per week', type: 'num', def: 40, min: 1, max: 100, step: 1 },
        { id: 'billable', label: 'Billable share of your time', type: 'pct', def: 60, min: 1, max: 100, step: 5, hint: 'The rest is sales, admin, and invoicing' }
      ],
      compute: function (v) {
        var preTax = v.taxPct >= 100 ? 0 : v.target / (1 - v.taxPct / 100);
        var revenue = preTax + v.expenses;
        var billableHours = v.weeks * v.hours * v.billable / 100;
        var rate = billableHours > 0 ? revenue / billableHours : 0;
        var naive = v.weeks * v.hours > 0 ? revenue / (v.weeks * v.hours) : 0;
        var dayRate = rate * 7.5;

        return {
          hero: { label: 'Charge at least', value: rate, fmt: 'money', unit: 'per billable hour' },
          stats: [
            { label: 'Day rate', value: dayRate, fmt: 'money0', note: 'at 7.5 billable hours' },
            { label: 'Revenue you need to bill', value: revenue, fmt: 'money0' },
            { label: 'Billable hours in a year', value: billableHours, fmt: 'int',
              note: 'out of ' + (v.weeks * v.hours).toLocaleString() + ' hours worked' },
            { label: 'Rate if all your time were billable', value: naive, fmt: 'money',
              note: 'the fantasy number most people quote' },
            { label: 'Unbillable time is costing you', value: rate - naive, fmt: 'money', note: 'per billable hour' }
          ],
          chart: {
            type: 'funnel', fmt: 'money0', title: 'From your rate back down to what you keep',
            steps: [
              { name: 'Billed', value: revenue },
              { name: 'After expenses', value: preTax },
              { name: 'Take-home', value: v.target }
            ]
          }
        };
      },
      assumptions: [
        'Works backwards: take-home is grossed up by your tax rate, business expenses are added, and the total is divided across genuinely billable hours only.',
        'The effective tax rate is a single blended figure you supply. For self-employment in Canada, remember you pay both halves of CPP.',
        'No employer benefits are included — no health coverage, no matched pension, no paid sick days. Add their value to your target income if you are comparing against a salaried offer.',
        'A 60% billable share is normal for an established freelancer. In your first year it is often closer to 35%.'
      ],
      faq: [
        { q: 'Why is the rate so much higher than an equivalent salary?',
          a: 'Because a salary buys you paid vacation, benefits, a pension match, and someone else finding the work. As a freelancer you fund all of that from the same rate, out of roughly 60% of your working hours.' },
        { q: 'Should I quote hourly at all?',
          a: 'Use this to find your floor, then quote fixed-price against the value of the outcome. Hourly billing caps your income at the number of hours in a week and quietly punishes you for getting faster.' }
      ]
    },

    /* ---------------------------------------------------------------- */
    {
      slug: 'percentage-calculator',
      name: 'Percentage Calculator',
      short: 'Percentage',
      cat: 'Everyday Math',
      blurb: 'All five percentage questions in one place, including the two that trip everyone up.',
      seoDesc: 'Free percentage calculator: percent of a number, what percent one number is of another, percentage increase and decrease, and reverse percentage.',
      inputs: [
        { id: 'mode', label: 'What do you need?', type: 'select', def: 'of',
          options: [
            { v: 'of', l: 'What is X% of Y?' },
            { v: 'is', l: 'X is what percent of Y?' },
            { v: 'change', l: 'Percentage change from X to Y' },
            { v: 'increase', l: 'Increase X by Y%' },
            { v: 'reverse', l: 'X is Y% of what number?' }
          ] },
        { id: 'a', label: 'First number', type: 'num', def: 15, step: .01 },
        { id: 'b', label: 'Second number', type: 'num', def: 240, step: .01 }
      ],
      compute: function (v) {
        var out, label, extra = [];
        switch (v.mode) {
          case 'of':
            out = v.a / 100 * v.b;
            label = fmtNum(v.a) + '% of ' + fmtNum(v.b);
            extra.push({ label: 'The rest', value: v.b - out, fmt: 'num', note: (100 - v.a).toFixed(2).replace(/\.?0+$/, '') + '% of ' + fmtNum(v.b) });
            break;
          case 'is':
            out = v.b === 0 ? 0 : v.a / v.b * 100;
            label = fmtNum(v.a) + ' as a percentage of ' + fmtNum(v.b);
            extra.push({ label: 'As a fraction', value: null, fmt: 'text', text: fmtNum(v.a) + ' / ' + fmtNum(v.b) });
            break;
          case 'change':
            out = v.a === 0 ? 0 : (v.b - v.a) / Math.abs(v.a) * 100;
            label = 'Change from ' + fmtNum(v.a) + ' to ' + fmtNum(v.b);
            extra.push({ label: 'Absolute change', value: v.b - v.a, fmt: 'num' });
            extra.push({ label: 'Direction', value: null, fmt: 'text', text: out > 0 ? 'increase' : out < 0 ? 'decrease' : 'no change' });
            break;
          case 'increase':
            out = v.a * (1 + v.b / 100);
            label = fmtNum(v.a) + ' increased by ' + fmtNum(v.b) + '%';
            extra.push({ label: 'Amount added', value: out - v.a, fmt: 'num' });
            extra.push({ label: 'Decreased instead', value: v.a * (1 - v.b / 100), fmt: 'num',
              note: 'note this is not the reverse of an increase' });
            break;
          default:
            out = v.b === 0 ? 0 : v.a / (v.b / 100);
            label = fmtNum(v.a) + ' is ' + fmtNum(v.b) + '% of';
            extra.push({ label: 'The remaining part', value: (v.b === 0 ? 0 : v.a / (v.b / 100)) - v.a, fmt: 'num' });
        }
        var isPct = v.mode === 'is' || v.mode === 'change';
        return {
          hero: { label: label, value: out, fmt: isPct ? 'pct2' : 'num' },
          stats: extra
        };
      },
      assumptions: [
        'Percentage change is measured against the first number, which is why going from 50 to 100 is a 100% increase but going from 100 back to 50 is only a 50% decrease.',
        'A percentage increase followed by the same percentage decrease never returns you to the start. Raise 100 by 20% and cut it by 20% and you land on 96.'
      ],
      faq: [
        { q: 'Why is a 20% rise then a 20% fall not break-even?',
          a: 'Because the second percentage is taken from a bigger number. The 20% you added was 20 of 100; the 20% you removed was 24 of 120. This is also why an investment that drops 50% needs a 100% gain to recover.' },
        { q: 'What is the difference between percent and percentage points?',
          a: 'If a rate goes from 4% to 5%, that is a rise of one percentage point, but a 25% increase. Financial reporting mixes these up constantly, usually in whichever direction sounds better.' }
      ]
    }
  ];

  /* ---------------- small formatters used inside compute() ---------------- */

  function fmtMoney(n) {
    return '$' + (Math.round(n * 100) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtPct(n) { return (Math.round(n * 100) / 100) + '%'; }
  function fmtNum(n) { return (Math.round(n * 1e6) / 1e6).toLocaleString('en-CA'); }
  function fmtYears(y) {
    var yr = Math.floor(y), mo = Math.round((y - yr) * 12);
    if (mo === 12) { yr++; mo = 0; }
    return ((yr ? yr + ' yr ' : '') + (mo ? mo + ' mo' : '')).trim() || '0 mo';
  }
  function fmtMonths(m) { return fmtYears(m / 12); }

  // Band-by-band breakdown table for the land transfer tax calculator.
  function bandRows(price, toronto) {
    var edges = [0, 55000, 250000, 400000, 2000000, 3000000, 4000000, 5000000, 10000000, 20000000];
    var onRates = [.005, .01, .015, .02, .025, .025, .025, .025, .025, .025];
    var toRates = [.005, .01, .015, .02, .025, .035, .045, .055, .065, .075];
    var rows = [];
    for (var k = 0; k < edges.length && edges[k] < price; k++) {
      var lo = edges[k], hi = k + 1 < edges.length ? edges[k + 1] : Infinity;
      var portion = Math.min(price, hi) - lo;
      if (portion <= 0) continue;
      var label = fmtMoney(lo).replace('.00', '') + ' – ' + (hi === Infinity ? 'up' : fmtMoney(hi).replace('.00', ''));
      var row = [label, (onRates[k] * 100) + '%', portion * onRates[k]];
      if (toronto) row.push((toRates[k] * 100) + '%', portion * toRates[k]);
      rows.push(row);
    }
    return rows;
  }

  var CATEGORIES = [
    { id: 'Mortgage & Property', blurb: 'Canadian mortgage math done the way Canadian lenders actually do it.' },
    { id: 'Saving & Investing',  blurb: 'Compounding, goals, and the gap between what you save and what it becomes.' },
    { id: 'Debt & Borrowing',    blurb: 'What borrowing costs, and the fastest honest way out of it.' },
    { id: 'Business & Marketing',blurb: 'The numbers that decide whether a campaign or a rate card actually works.' },
    { id: 'Everyday Math',       blurb: 'The small ones you look up over and over.' }
  ];

  root.CALC_DATA = { calculators: CALCULATORS, categories: CATEGORIES };

})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).CALC_DATA;
}
