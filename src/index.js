process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://a9ac468e07e44180b5e32f5aae525939@errors.cozycloud.cc/36'

const {
  BaseKonnector,
  requestFactory,
  log,
  cozyClient,
  saveFiles,
  solveCaptcha
} = require('cozy-konnector-libs')

const models = cozyClient.new.models
const { Qualification } = models.document

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
  log('info', 'Vous êtes connecté')

  const { docs, firstToken } = await parseDocs(authRequest)
  await downloadFiles(docs, firstToken, this.accountId, fields)
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
    uri: 'https://api.harmonie-mutuelle.fr/services/hapiour/adherent-api/v1/authenticate/prospect',
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
    uri: 'https://api.harmonie-mutuelle.fr/services/hapiour/adherent-api/v1/authenticate/adherent',
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
}

async function parseDocs(authResponse) {
  log('debug', 'Vérification des factures')
  const firstToken = authResponse.caseless.dict.authorization
  try {
    const docsList = await request({
      uri: 'https://api.harmonie-mutuelle.fr/services/hapiour/adherent-api/v1/documents?typeDocument=COURRIER_SANTE_ACTIVITE',
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:94.0) Gecko/20100101 Firefox/94.0',
        'content-type': 'application/json',
        ApiKey: `${ApiKey}`,
        Authorization: `${firstToken}`
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
        fileAttributes: {
          metadata: {
            contentAuthor: 'harmonie-et-moi.fr',
            issueDate: new Date(),
            datetime: doc.dateEdition,
            datetimeLabel: `issueDate`,
            vendorRef: doc.idDocument,
            carbonCopy: true,
            qualification: Qualification.getByLabel('other_health_document')
          }
        }
      }
    })
    return { docs, firstToken }
  } catch (err) {
    log('debug', err.message.substring(0, 60))
    log('debug', `Pas de documents trouvé pour ce compte`)
    return []
  }
}

async function downloadFiles(docs, firstToken, accountId, fields) {
  log('debug', `Downloading file one by one`)
  try {
    let firstDocArray = []
    firstDocArray.push({
      ...docs.shift(),
      requestOptions: {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:94.0) Gecko/20100101 Firefox/94.0',
          'content-type': 'application/json',
          ApiKey: `${ApiKey}`,
          Authorization: `${firstToken}`
        }
      }
    })
    const fileRequest = await request({
      uri: `${firstDocArray[0].fileurl}`,
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:94.0) Gecko/20100101 Firefox/94.0',
        'content-type': 'application/json',
        ApiKey: `${ApiKey}`,
        Authorization: `${firstToken}`
      },
      resolveWithFullResponse: true
    })
    let nextToken = fileRequest.caseless.dict.authorization
    await saveFiles(firstDocArray, fields, {
      fileIdAttributes: ['vendorRef'],
      identifiers: ['Harmonie Mutuelle'],
      sourceAccount: accountId,
      sourceAccountIdentifier: fields.login
    })

    for (let i = 0; i < docs.length; i++) {
      let leftoverDocs = []
      leftoverDocs.push({
        ...docs[i],
        requestOptions: {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:94.0) Gecko/20100101 Firefox/94.0',
            'content-type': 'application/json',
            ApiKey: `${ApiKey}`,
            Authorization: `${nextToken}`
          }
        }
      })

      const loopFileRequest = await request({
        uri: `${docs[i].fileurl}`,
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:94.0) Gecko/20100101 Firefox/94.0',
          'content-type': 'application/json',
          ApiKey: `${ApiKey}`,
          Authorization: `${nextToken}`
        },
        resolveWithFullResponse: true
      })
      nextToken = loopFileRequest.caseless.dict.authorization
      await saveFiles(leftoverDocs, fields, {
        fileIdAttributes: ['vendorRef'],
        identifiers: ['Harmonie Mutuelle'],
        sourceAccount: accountId,
        sourceAccountIdentifier: fields.login
      })
    }
  } catch (err) {
    log('debug', `something went wrong with this file`)
    log('debug', err.message)
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
