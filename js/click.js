/* =====================================================
   CLICK — payment links (my.click.uz)
   Products and prices MUST match PLANS in functions/index.js.
   clickComplete reads transaction_param as "<uid>.<product>".
===================================================== */
export const CLICK_SERVICE_ID  = "112479";
export const CLICK_MERCHANT_ID = "64974";

// price per product in so'm
export const PRICES = { start: 19000, plus: 49000, pro: 149000, stars: 19000 };

export function clickPayUrl(uid, product) {
  return "https://my.click.uz/services/pay/"
    + "?service_id=" + CLICK_SERVICE_ID
    + "&merchant_id=" + CLICK_MERCHANT_ID
    + "&amount=" + PRICES[product]
    + "&transaction_param=" + encodeURIComponent(uid + "." + product);
}
