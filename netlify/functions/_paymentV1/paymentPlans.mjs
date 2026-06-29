export const PAYMENT_V1_PLANS = {
  report_50_beta: {
    code: 'report_50_beta',
    name: 'Relatório 50',
    description: 'Relatório beta com até 50 análises',
    value: 49.9,
    analysisLimit: 50,
  },
  report_100: {
    code: 'report_100',
    name: 'Relatório 100',
    description: 'Relatório beta com até 100 análises',
    value: 99.9,
    analysisLimit: 100,
  },
  report_150: {
    code: 'report_150',
    name: 'Relatório 150',
    description: 'Relatório beta com até 150 análises',
    value: 149.9,
    analysisLimit: 150,
  },
};

export const getPaymentV1Plan = (planCode) => PAYMENT_V1_PLANS[String(planCode || '')] || null;
export const listPaymentV1Plans = () => Object.values(PAYMENT_V1_PLANS);
