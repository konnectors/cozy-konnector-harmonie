process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://c21e908d57a340d0808fc44e59e6b4e2:b60af624e8364277b9ee2e864eb11d36@sentry.cozycloud.cc/16'

const {
  BaseKonnector,
  requestFactory,
  // scrape,
  log,
  // utils,
  // cozyClient,
  solveCaptcha
} = require('cozy-konnector-libs')

// const models = cozyClient.new.models
// const { Qualification } = models.document

const request = requestFactory({
  // The debug mode shows all the details about HTTP requests and responses. Very useful for
  // debugging but very verbose. This is why it is commented out by default
  debug: true,
  // Activates [cheerio](https://cheerio.js.org/) parsing on each page
  cheerio: false,
  // If cheerio is activated do not forget to deactivate json parsing (which is activated by
  // default in cozy-konnector-libs
  json: true,
  // This allows request-promise to keep cookies between requests
  jar: true
})

const baseUrl = 'https://www.harmonie-et-moi.fr'

// const coUrl = baseUrl + '/identification'

module.exports = new BaseKonnector(start)

async function start(fields, cozyParameters) {
  log('info', 'Identification')
  if (cozyParameters) log('debug', 'Paramètres trouvés')
  await authenticate.bind(this)(fields.login, fields.password)
  log('info', 'Vous êtes connecté')
  // const bills = await parseBill()

  // await this.saveBills(bills, fields, {
  //   fileIdAttributes: ['vendorRef'],
  //   linkBankOperations: false,
  //   identifiers: ['Harmonie Mutuelle'],
  //   sourceAccount: this.accountId,
  //   sourceAccountIdentifier: fields.login
  // })
  // log('info', 'Fin de la récupération')
}

async function authenticate(username, password) {
  log('debug', 'Authentification en cours')
  const recaptchaValue = await solveCaptcha({
    type: 'recaptchav2',
    websiteKey: '',
    websiteUrl: `${baseUrl}/identification`,
    pageAction: 'login',
    minScore: 0.9
  })
  const ApiKey = '710dhdh45j463hza324j8d3u8ns623g5'
  const loginId = 'hmd-1322145'

  await request({
    uri:
      'https://api.harmonie-mutuelle.fr/services/hapiour/adherent-api/v1/authenticate/adherent',
    method: 'POST',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:94.0) Gecko/20100101 Firefox/94.0',
      'content-type': 'application/json',
      ApiKey: `${ApiKey}`
    },
    body: JSON.stringify({
      username: username,
      password: password,
      recaptcha: recaptchaValue,
      os: 'Autre',
      id: loginId,
      application: 'extranet-adherent-front',
      version: '39.0.5'
    })
  })
    .catch(err => {
      log('err', err)
    })
    .then(resp => {
      return resp
    })
}

// async function parseBill() {
//   log('debug', 'Vérification des factures')

//   try {
//     await request({
//       uri:
//         'https://api.harmonie-mutuelle.fr/services/hapiour/adherent-api/v1/documents',
//       method: 'GET',
//       headers: {
//         'User-Agent':
//           'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:94.0) Gecko/20100101 Firefox/94.0',
//         'content-type': 'application/json',
//         ApiKey: `${ApiKey}`,
//         Authorization: `${authToken}`
//       },
//       body: ''
//     })
//   } catch (err) {
//     log('debug', err.message.substring(0, 60))
//     log('debug', `Pas de facture trouvée pour ce compte`)
//     return []
//   }

//   const docs = scrape(
//     $,
//     {
//       label: {
//         sel: '.detail-facture__label strong'
//       },
//       vendorRef: {
//         sel: '.text--body',
//         parse: ref => ref.match(/^N° (.*)$/).pop()
//       },
//       date: {
//         sel: '.detail-facture__date',
//         parse: date => moment(date, 'DD/MM/YYYY').toDate()
//       },
//       status: {
//         sel: '.detail-facture__statut'
//       },
//       amount: {
//         sel: '.detail-facture__montant',
//         parse: normalizeAmount
//       },
//       fileurl: {
//         sel: '.btn--telecharger',
//         attr: 'href'
//       }
//     },
//     '.detail-facture'
//   )

//   const bills = []

//   for (const doc of docs) {
//     const { vendorRef, label, amount, date, fileurl } = doc
//     const echDate = doc.date
//     bills.push({
//       vendorRef,
//       label,
//       amount,
//       date,
//       fileurl: `https://www.harmonie-et-moi.fr${fileurl}`,
//       filename: `${utils.formatDate(echDate)}_HarmonieMutuelle_document.pdf`,
//       vendor: 'Harmonie Mutuelle',
//       fileAttributes: {
//         metadata: {
//           contentAuthor: 'harmonie-et-moi.fr',
//           issueDate: utils.formatDate(date),
//           datetime: utils.formatDate(date),
//           datetimeLabel: `issueDate`,
//           invoiceNumber: `${vendorRef}`,
//           carbonCopy: true,
//           qualification: Qualification.getByLabel('other_health_document')
//         }
//       }
//     })
//   }
//   return bills
// }

// const normalizeAmount = amount => {
//   if (amount.includes('/')) return false
//   return parseFloat(
//     amount
//       .replace('€', '')
//       .replace(',', '.')
//       .replace(' ', '')
//       .trim()
//   )
// }
