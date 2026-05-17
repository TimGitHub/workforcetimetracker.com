/* Marketing site source of truth for published prices.
 *
 * IMPORTANT: When changing any of these numbers, ALSO update the C# source of truth at
 *   src/App.Core/PricingConstants.cs
 * and re-mirror this docs/ folder to the live workforcetimetracker.com repo.
 * See Rule 12 in .github/instructions/project-rules.instructions.md.
 *
 * Hydrates any element with a data-price attribute. Examples in HTML:
 *   <span data-price="monthly"></span>                 ->  EUR 5
 *   <span data-price="annual"></span>                  ->  EUR 50
 *   <span data-price="badge"></span>                   ->  EUR 5/month or EUR 50/year
 *   <span data-price="monthly-symbol"></span>          ->  €5
 *   <span data-price="annual-symbol"></span>           ->  €50
 *   <span data-price="annual-savings-symbol"></span>   ->  €10
 *   <span data-price="annual-savings-line"></span>     ->  Save €10/year vs monthly
 *
 * For pages that build their pricing card via JavaScript (index.html), read window.WTT_PRICING
 * directly instead of using data-price attributes.
 */
(function () {
    var P = {
        currency: "EUR",
        currencySymbol: "\u20AC", // EUR symbol
        monthly: 5,
        annual: 50
    };
    P.annualSavings = (P.monthly * 12) - P.annual;
    P.savingsPercent = Math.round((P.annualSavings / (P.monthly * 12)) * 100);

    var TEXT = {
        "monthly":                P.currency + " " + P.monthly,
        "annual":                 P.currency + " " + P.annual,
        "monthly-symbol":         P.currencySymbol + P.monthly,
        "annual-symbol":          P.currencySymbol + P.annual,
        "annual-savings-symbol":  P.currencySymbol + P.annualSavings,
        "annual-savings-line":    "Save " + P.currencySymbol + P.annualSavings + "/year vs monthly",
        "badge":                  P.currency + " " + P.monthly + "/month or " + P.currency + " " + P.annual + "/year"
    };

    window.WTT_PRICING = P;
    window.WTT_PRICING_TEXT = TEXT;

    function hydrate() {
        var nodes = document.querySelectorAll("[data-price]");
        for (var i = 0; i < nodes.length; i++) {
            var key = nodes[i].getAttribute("data-price");
            if (TEXT.hasOwnProperty(key)) {
                nodes[i].textContent = TEXT[key];
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", hydrate);
    } else {
        hydrate();
    }
})();
