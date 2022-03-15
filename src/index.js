process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://c21e908d57a340d0808fc44e59e6b4e2:b60af624e8364277b9ee2e864eb11d36@sentry.cozycloud.cc/16'

const {
  BaseKonnector,
  requestFactory,
  log,
  // cozyClient,
  solveCaptcha
} = require('cozy-konnector-libs')

// const models = cozyClient.new.models
// const { Qualification } = models.document

const request = requestFactory({
  // The debug mode shows all the details about HTTP requests and responses. Very useful for
  // debugging but very verbose. This is why it is commented out by default
  // debug: true,
  // Activates [cheerio](https://cheerio.js.org/) parsing on each page
  cheerio: false,
  // If cheerio is activated do not forget to deactivate json parsing (which is activated by
  // default in cozy-konnector-libs
  json: true,
  // This allows request-promise to keep cookies between requests
  jar: true
})

const ApiKey = '710dhdh45j463hza324j8d3u8ns623g5'
const loginId = 'hmd-1322145'

module.exports = new BaseKonnector(start)

async function start(fields, cozyParameters) {
  log('info', 'Identification')

  if (cozyParameters) log('debug', 'Paramètres trouvés')
  const authRequest = await authenticate
    .bind(this)(fields.login, fields.password)
    .then(response => {
      return response
    })

  log('info', authRequest)
  log('info', 'Vous êtes connecté')

  const docs = await parseDocs(authRequest)

  await this.saveFiles(docs, fields, {
    fileIdAttributes: ['vendorRef'],
    identifiers: ['Harmonie Mutuelle'],
    sourceAccount: this.accountId,
    sourceAccountIdentifier: fields.login
  })
  log('info', 'Fin de la récupération')
}

async function authenticate(username, password) {
  log('debug', 'Authentification en cours')

  const websiteKey = '6LcGBY0aAAAAAP37MlKdEgKEJApjrC_k5SUS0QMN'
  const websiteURL = `https://authentification.harmonie-mutuelle.fr/auth/realms/adherents/protocol/openid-connect/auth?client_id=hmd_extranet_adherent_front&redirect_uri=https%3A%2F%2Fharmonie-et-moi.fr%2Fidentification&state=3c2c92d9-ece7-4c5a-bb36-b7ab815f1882&response_mode=query&response_type=code&scope=openid&nonce=2efa6299-d6e8-410a-a1a4-241ce455cec4`

  const recaptchaKey = await solveCaptcha({
    websiteKey,
    websiteURL
  })

  await request({
    uri:
      'https://api.harmonie-mutuelle.fr/services/hapiour/adherent-api/v1/authenticate/prospect',
    method: 'POST',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:94.0) Gecko/20100101 Firefox/94.0',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3',
      'Content-Type': 'application/json',
      ApiKey: '710dhdh45j463hza324j8d3u8ns623g5',
      Origin: 'https://harmonie-et-moi.fr',
      Connection: 'keep-alive',
      Referer: 'https://harmonie-et-moi.fr/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site'
    },
    body: {
      username: username,
      password: password,
      recaptcha: recaptchaKey,
      os: 'Autre',
      id: loginId,
      application: 'extranet-adherent-front',
      version: '39.0.5'
    },
    resolveWithFullResponse: true
  })
    .catch(err => {
      if (err.statusCode != 200) {
        log('err', err.message)
      }
    })
    .then(response => {
      return response
    })

  const authRequest = await request({
    uri:
      'https://api.harmonie-mutuelle.fr/services/hapiour/adherent-api/v1/authenticate/adherent',
    method: 'POST',
    headers: {
      Host: 'api.harmonie-mutuelle.fr',
      'User-Agent':
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:94.0) Gecko/20100101 Firefox/94.0',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3',
      'Accept-Encoding': 'gzip,deflate, br',
      'Content-Type': 'application/json',
      ApiKey: '710dhdh45j463hza324j8d3u8ns623g5',
      Origin: 'https://harmonie-et-moi.fr',
      Connection: 'keep-alive',
      Referer: 'https://harmonie-et-moi.fr/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site'
    },
    body: {
      username: username,
      password: password,
      recaptcha: recaptchaKey,
      os: 'Autre',
      id: loginId,
      application: 'extranet-adherent-front',
      version: '39.0.5'
    },
    resolveWithFullResponse: true
  })

  return authRequest
  // .then(response => {
  //   log('debug', response)
  //   return response
  // })
}

async function parseDocs(authResponse) {
  log('debug', 'Vérification des factures')
  try {
    const docsList = await request({
      uri:
        'https://api.harmonie-mutuelle.fr/services/hapiour/adherent-api/v1/documents?typeDocument=COURRIER_SANTE_ACTIVITE',
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:94.0) Gecko/20100101 Firefox/94.0',
        'content-type': 'application/json',
        ApiKey: `${ApiKey}`,
        Authorization: `${authResponse.caseless.dict.authorization}`
      }
    })
    const docs = docsList.documentV1List.map(doc => {
      return {
        typeDocument: doc.typeDocument,
        filename: `${doc.dateEdition}_${doc.nom
          .replace(/ /g, '_')
          .toLowerCase()}_HarmonieMutuelle.pdf`,
        fileurl: `https://api.harmonie-mutuelle.fr/services/hapiour/adherent-api/v1/document/${doc.idDocument}`,
        vendorRef: doc.idDocument,
        date: doc.dateEdition,
        requestOptions: {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:94.0) Gecko/20100101 Firefox/94.0',
            'content-type': 'application/json',
            ApiKey: `${ApiKey}`,
            Authorization: `${authResponse.caseless.dict.authorization}`
          }
        }
      }
    })
    log('debug', docs)
    return docs
  } catch (err) {
    log('debug', err.message.substring(0, 60))
    log('debug', `Pas de documents trouvé pour ce compte`)
    return []
  }

  // We keep this around for future updates, it contains informations about the reimbursements but the account we are using to fix the konnector did not dispose of bills.

  // const bills = []

  // for (const doc of docs) {
  //   const { vendorRef, label, amount, date, fileurl } = doc
  //   const echDate = doc.date
  //   bills.push({
  //     vendorRef,
  //     label,
  //     amount,
  //     date,
  //     fileurl: `https://www.harmonie-et-moi.fr${fileurl}`,
  //     filename: `${utils.formatDate(echDate)}_HarmonieMutuelle_document.pdf`,
  //     vendor: 'Harmonie Mutuelle',
  //     fileAttributes: {
  //       metadata: {
  //         contentAuthor: 'harmonie-et-moi.fr',
  //         issueDate: utils.formatDate(date),
  //         datetime: utils.formatDate(date),
  //         datetimeLabel: `issueDate`,
  //         invoiceNumber: `${vendorRef}`,
  //         carbonCopy: true
  //         // qualification: Qualification.getByLabel('other_health_document')
  //       }
  //     }
  //   })
  // }
  // return bills
}

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
