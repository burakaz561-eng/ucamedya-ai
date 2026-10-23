// Teklif toplam hesabı (ana süreç ve arayüz aynı fonksiyonu kullanır).

export interface OfferLine {
  quantity: number
  unitPrice: number
  vatRate: number
}

/** Teklif toplamlarını hesaplar (saf fonksiyon; birim testli). İndirim KDV öncesi uygulanır. */
export function computeTotals(items: OfferLine[], discountType: string, discountValue: number, vatIncluded: boolean) {
  const r2 = (n: number) => Math.round(n * 100) / 100
  const lines = items.map((it) => {
    const gross = it.quantity * it.unitPrice
    const net = vatIncluded ? gross / (1 + it.vatRate / 100) : gross
    return { net, rate: it.vatRate }
  })
  const netSum = lines.reduce((s, l) => s + l.net, 0)
  const discount = discountType === 'percent' ? (netSum * Math.min(100, Math.max(0, discountValue))) / 100 : discountType === 'amount' ? Math.min(netSum, Math.max(0, discountValue)) : 0
  const factor = netSum ? (netSum - discount) / netSum : 1
  const vat = lines.reduce((s, l) => s + l.net * factor * (l.rate / 100), 0)
  const subtotal = netSum - discount
  return { subtotal: r2(subtotal), discount: r2(discount), vatTotal: r2(vat), total: r2(subtotal + vat) }
}

