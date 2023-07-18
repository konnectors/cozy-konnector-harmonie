import { ContentScript } from 'cozy-clisk/dist/contentscript'
import Minilog from '@cozy/minilog'
import waitFor, { TimeoutError } from 'p-wait-for'
const log = Minilog('ContentScript')
Minilog.enable('harmonieCCC')

// const baseUrl = 'https://harmonie-mutuelle.fr'
const loginUrl = 'https://harmonie-et-moi.fr/identification'

const personnalInfos = []
const userDocuments = []
const userContracts = []
// The override here is needed to intercept XHR requests made during the navigation
var proxied = window.XMLHttpRequest.prototype.open

window.XMLHttpRequest.prototype.open = function () {
  var originalResponse = this
  // Intercept user's personnal infos
  if (arguments[1].includes('/adherent-api/v2/contact/client')) {
    originalResponse.addEventListener('readystatechange', function () {
      if (originalResponse.readyState === 4) {
        // The response is a unique string, in order to access information parsing into JSON is needed.
        const jsonPersonnalInfos = JSON.parse(originalResponse.responseText)
        personnalInfos.push(jsonPersonnalInfos)
      }
    })
    return proxied.apply(this, [].slice.call(arguments))
  }
  // Intercept user's documents
  if (arguments[1].includes('adherent-api/v1/documents?typeDocument')) {
    originalResponse.addEventListener('readystatechange', function () {
      if (originalResponse.readyState === 4) {
        // The response is a unique string, in order to access information parsing into JSON is needed.
        const jsonDocuments = JSON.parse(originalResponse.responseText)
        userDocuments.push(jsonDocuments)
      }
    })
    return proxied.apply(this, [].slice.call(arguments))
  }
  // Intercept user's contracts
  if (arguments[1].includes('adherent-api/v1/contrats?typeDocument')) {
    originalResponse.addEventListener('readystatechange', function () {
      if (originalResponse.readyState === 4) {
        // The response is a unique string, in order to access information parsing into JSON is needed.
        const jsonContracts = JSON.parse(originalResponse.responseText)
        userContracts.push(jsonContracts)
      }
    })
    return proxied.apply(this, [].slice.call(arguments))
  }
  // Always return the orginial response untouched
  return proxied.apply(this, [].slice.call(arguments))
}

class HarmonieContentScript extends ContentScript {
  async navigateToLoginForm() {
    this.log('info', '🤖 navigateToLoginForm')
    await this.goto(loginUrl)
    await Promise.race([
      this.waitForElementInWorker('.already-an-account-button'),
      this.waitForElementInWorker('.home-page-title')
    ])
  }

  // onWorkerEvent(event, payload) {
  //   if (event === 'loginSubmit') {
  //     this.log('info', 'received loginSubmit, blocking user interactions')
  //     this.blockWorkerInteractions()
  //   } else if (event === 'loginError') {
  //     this.log(
  //       'info',
  //       'received loginError, unblocking user interactions: ' + payload?.msg
  //     )
  //     this.unblockWorkerInteractions()
  //   }
  // }

  async ensureAuthenticated({ account }) {
    // this.bridge.addEventListener('workerEvent', this.onWorkerEvent.bind(this))
    this.log('info', '🤖 ensureAuthenticated')
    if (!account) {
      await this.ensureNotAuthenticated()
    }
    await this.navigateToLoginForm()
    const authenticated = await this.runInWorker('checkAuthenticated')
    if (!authenticated) {
      let credentials = await this.getCredentials()
      if (credentials) {
        this.log('info', 'credentials found, prefilling login form')
        await this.clickAndWait('.already-an-account-button', '#username')
        await this.prefillLoginForm(credentials)
        // We cannot do an autoLogin on this connector, there's always a captcha to pass
        await this.showLoginFormAndWaitForAuthentication()
        return true
      }
      this.log('info', 'Not authenticated')
      await this.clickAndWait('.already-an-account-button', '#username')
      await this.showLoginFormAndWaitForAuthentication()
      return true
    }
    this.unblockWorkerInteractions()
    return true
  }

  async prefillLoginForm(credentials) {
    this.log('info', 'prefillLoginForm starts')
    await this.runInWorker('fillText', '#username', credentials.email)
    await this.runInWorker('fillText', '#password', credentials.password)
  }

  async ensureNotAuthenticated() {
    this.log('info', '🤖 ensureNotAuthenticated')
    await this.navigateToLoginForm()
    const authenticated = await this.runInWorker('checkAuthenticated')
    if (!authenticated) {
      return true
    }
    await this.clickAndWait('button[routerlink="/mon-profil"]', '#logout')
    await this.clickAndWait('#logout', '.already-an-account-button')
    return true
  }

  // onWorkerReady() {
  //   const button = document.querySelector('input[type=submit]')
  //   if (button) {
  //     button.addEventListener('click', () =>
  //       this.bridge.emit('workerEvent', 'loginSubmit')
  //     )
  //   }
  //   const error = document.querySelector('.error')
  //   if (error) {
  //     this.bridge.emit('workerEvent', 'loginError', { msg: error.innerHTML })
  //   }
  // }

  async checkAuthenticated() {
    const loginField = document.querySelector('#username')
    const passwordField = document.querySelector('#password')
    if (loginField && passwordField) {
      const userCredentials = await this.findAndSendCredentials.bind(this)(
        loginField,
        passwordField
      )
      this.log('info', "Sending user's credentials to pilot")
      await this.sendToPilot({
        userCredentials
      })
    }
    return Boolean(document.querySelector('.home-page-title'))
  }

  async findAndSendCredentials(loginField, passwordField) {
    this.log('info', 'findAndSendCredentials starts')
    let userLogin = loginField.value
    let userPassword = passwordField.value
    const userCredentials = {
      email: userLogin,
      password: userPassword
    }
    return userCredentials
  }

  async showLoginFormAndWaitForAuthentication() {
    log.debug('showLoginFormAndWaitForAuthentication start')
    await this.setWorkerState({ visible: true })
    await this.runInWorkerUntilTrue({
      method: 'waitForAuthenticated'
    })
    await this.setWorkerState({ visible: false })
  }

  async getUserDataFromWebsite() {
    this.log('info', '🤖 getUserDataFromWebsite')
    await this.runInWorker('getIdentity')
    await this.saveIdentity(this.store.userIdentity)
    this.log(
      'info',
      `userIdentity : ${JSON.stringify(this.store.userIdentity)}`
    )
    if (this.store.userIdentity.email) {
      return {
        sourceAccountIdentifier: this.store.userIdentity.email
      }
    } else {
      throw new Error('No user data identifier, the konnector should be fixed')
    }
  }

  async fetch(context) {
    this.log('info', '🤖 fetch')
    if (this.store && this.store.userCredentials) {
      await this.saveCredentials(this.store.userCredentials)
    }
    await this.clickAndWait(
      'a[href*="/mes-documents"]',
      '.list-documents-flex-container'
    )
    await this.runInWorkerUntilTrue({ method: 'waitForDocsInterceptions' })
    const allDocuments = await this.runInWorker('getAllDocuments')
    await this.saveFiles(allDocuments, {
      context,
      fileIdAttributes: ['vendorRef'],
      contentType: 'application/pdf',
      qualificationLabel: 'other_health_document'
    })
  }

  async getIdentity() {
    this.log('info', 'getIdentity starts')
    const infos = personnalInfos[0]
    const userIdentity = {
      name: {
        givenName: infos.prenom,
        familyName: infos.nom
      },
      email: infos.email,
      phone: [],
      address: [
        {
          street: infos.rue,
          country: infos.pays,
          city: infos.ville,
          postCode: infos.codePostal
        }
      ],
      socialSecurityNumber: infos.numSecuriteSociale
    }

    if (infos.telephoneDomicile) {
      const houseNumber = {
        number: infos.telephoneDomicile,
        type: 'home'
      }
      userIdentity.phone.push(houseNumber)
    }
    if (infos.telephonePortable) {
      const mobileNumber = {
        number: infos.telephonePortable,
        type: 'mobile'
      }
      userIdentity.phone.push(mobileNumber)
    }
    await this.sendToPilot({ userIdentity })
  }

  async waitForDocsInterceptions() {
    await waitFor(
      () => {
        this.log('info', `contracts : ${JSON.stringify(userContracts)}`)
        this.log('info', `docs : ${JSON.stringify(userDocuments)}`)
        if (userDocuments.length > 0 && userContracts.length > 0) {
          this.log('info', 'Interceptions OK, continue')
          return true
        }
        return false
      },
      {
        interval: 5000,
        timeout: {
          milliseconds: 30000,
          message: new TimeoutError(
            'Not all interceptions could have been done, check if any changes have been operated on the website'
          )
        }
      }
    )
    return true
  }

  async getAllDocuments() {
    this.log('info', 'getAllDocuments starts')
    const contracts = await this.getContracts()
    this.log('info', `computedContracts is : ${JSON.stringify(contracts)}`)
    const healthDocs = await this.getDocuments()
    this.log('info', `computedDocs is : ${JSON.stringify(healthDocs)}`)
    const allDocuments = contracts.concat(healthDocs)
    return allDocuments
  }

  getContracts() {
    this.log('info', 'getContracts starts')
    const token = window.localStorage.getItem('_cap_token')
    const allContracts = []
    const contracts = userContracts[0].contrats
    for (const contract of contracts) {
      const contractId = contract.numeroContrat
      for (const document of contract.documents) {
        const vendorRef = document.idDocument
        const documentType = document.typeDocument
        const editionDate = document.dateEdition
        const filename = `${editionDate}_${document.nom}`
        const fileurl = `https://hapiour.harmonie-mutuelle.fr/adherent-api/v1/document/${vendorRef}`
        const computedDoc = {
          vendorRef,
          vendor: 'Harmonie Mutuelle',
          filename,
          fileurl,
          documentType,
          contractId,
          date: new Date(editionDate),
          fileAttributes: {
            metadata: {
              contentAuthor: 'harmonie-et-moi.fr',
              issueDate: new Date(),
              datetime: new Date(editionDate),
              datetimeLabel: 'issueDate',
              carbonCopy: true
            }
          },
          requestOptions: {
            headers: {
              Authorization: token
            }
          }
        }
        allContracts.push(computedDoc)
      }
    }
    return allContracts
  }

  getDocuments() {
    this.log('info', 'getDocuments starts')
    const token = window.localStorage.getItem('_cap_token')
    const allDocuments = []
    const jsonDocuments = userDocuments[0].documentV1List
    this.log('info', `jsonDocs is : ${JSON.stringify(jsonDocuments)}`)
    for (const oneDoc of jsonDocuments) {
      const vendorRef = oneDoc.idDocument
      const documentType = oneDoc.typeDocument
      const editionDate = oneDoc.dateEdition
      const filename = `${editionDate}_${oneDoc.nom}.pdf`
      const fileurl = `https://hapiour.harmonie-mutuelle.fr/adherent-api/v1/document/${vendorRef}`
      const computedDoc = {
        vendorRef,
        vendor: 'Harmonie Mutuelle',
        filename,
        fileurl,
        documentType,
        date: new Date(editionDate),
        fileAttributes: {
          metadata: {
            contentAuthor: 'harmonie-et-moi.fr',
            issueDate: new Date(),
            datetime: new Date(editionDate),
            datetimeLabel: 'issueDate',
            carbonCopy: true
          }
        },
        requestOptions: {
          headers: {
            Authorization: token
          }
        }
      }
      allDocuments.push(computedDoc)
    }
    return allDocuments
  }
}

const connector = new HarmonieContentScript()
connector
  .init({
    additionalExposedMethodsNames: [
      'getIdentity',
      'getAllDocuments',
      'waitForDocsInterceptions'
    ]
  })
  .catch(err => {
    log.warn(err)
  })
