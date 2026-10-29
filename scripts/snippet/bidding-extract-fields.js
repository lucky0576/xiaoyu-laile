export function extractFields(text) {
  const t = String(text || '').replace(/\r/g, '');
  const pick = (re) => {
    const m = re.exec(t);
    return m ? String(m[1] || '').trim().slice(0, 80) : '';
  };

  /** 去掉「为 / 是 / 名称：」这类前缀和尾部标点 */
  const clean = (v) =>
    String(v || '')
      .replace(/^[\s是为：:、]+/, '')
      .replace(/^[）)]+/, '')
      .replace(/[\s，,。；;：:）)]+$/, '')
      .trim();

  /** 代理机构：只要「xx公司/xx中心」这种，抓到「受招标人委托…」就作废 */
  const agencyRaw = clean(pick(/(?:采购代理机构|招标代理机构|代理机构)(?:名称)?[：:\s|｜]+([^\n|｜，,。；;：:]{2,60})/));
  const agency = /委托|受|事宜|负责|本工程/.test(agencyRaw) ? '' : agencyRaw;

  return {
    tenderNo: clean(pick(/项目编号[：:\s]*([A-Za-z0-9\-_（）()【】\[\]／/]{4,60})/)),
    tenderer: clean(pick(/(?:采购人|招标人|采购单位)(?:名称)?[：:\s|｜]+([^\n|｜，,。；;：:]{2,60})/)),
    agency,
    budget: clean(pick(/(?:预算金额|采购预算|最高限价|控制价)[^0-9]{0,8}([\d,.]+\s*(?:万元|元|亿元))/)),
    bidDeadline: '',
    bidOpenAt: '',
    bidPlace: '',
    qualification: '',
    contact: '',
  };
}
