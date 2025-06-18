$(document).ready(function () {
  // Skip initialization if no donation form exists
  if (!$("[data-donate='complete-button']").length) return;

  /**
   * Configuration and Constants
   */
  const CONFIG = {
    urls: {
      authentication: 'https://security.dm.akaraisin.com/api/authentication',
      monerisToken: 'https://www3.moneris.com/HPPtoken/index.php',
      constituentApi: 'https://api.akaraisin.com/v2/constituent',
      paypalInit: 'https://api.akaraisin.com/v2/payment/paypal',
      fallbackDonation: 'https://jack.akaraisin.com/ui/donatenow',
    },
    organizationId: 196,
    defaultSubEvent: 'YE25W',
    sponsoredEntityTypes: {
      Event: 1,
      Team: 2,
      Participant: 3,
      Group: 4,
    },
    utmSourceMapping: {
      '34705': 'YE25BRE',
      '34694': 'YE25W',
      '34700': 'YE25A',
      '34703': 'YE25DM',
      '34695': 'YE25M1',
      '34696': 'YE25M2',
      '34697': 'YE25M3',
      '34698': 'YE25M4',
      '34769': 'Fall25A',
    },
  };

  /**
   * State Management
   */
  const state = {
    jwtToken: '',
    monerisDataKey: '',
    monerisBin: '',
    isProcessing: false,
    isFrench: false,
    subEventCustomPart: CONFIG.defaultSubEvent,
    currentForm: null,
  };

  /**
   * Donation Types Mapping
   */
  const DONATION_TYPES = {
    general: {
      'one-time': 1,
      'monthly': 4,
      'quarterly': 5,
      'annual': 6,
    },
    honour: {
      'one-time': 2,
      'monthly': 7,
      'quarterly': 9,
      'annual': 10,
    },
    memory: {
      'one-time': 3,
      'monthly': 12,
      'quarterly': 21,
      'annual': 22,
    },
  };

  /**
   * Utility Functions
   */
  const utils = {
    getUrlParameter(name) {
      const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
      const results = regex.exec(location.search);
      return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
    },

    formatPhoneNumber(phone) {
      if (!phone) return '';
      const digits = phone.replace(/\D/g, '');
      return digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    },

    trimFormValues(obj) {
      const trimmed = {};
      Object.keys(obj).forEach((key) => {
        trimmed[key] = typeof obj[key] === 'string' ? obj[key].trim() : obj[key];
      });
      return trimmed;
    },

    getCardType(bin) {
      const binStr = bin.toString();
      if (/^5[1-5]/.test(binStr)) return 1; // MasterCard
      if (/^4/.test(binStr)) return 2; // VISA
      if (/^3[47]/.test(binStr)) return 3; // AMEX
      if (/^3[68]/.test(binStr)) return 4; // Diners Club
      if (/^6011|^65/.test(binStr)) return 5; // Discover
      return 0; // Unknown
    },
  };

  /**
   * Form Data Collection
   */
  const formHelpers = {
    getFormData($form) {
      const fields = {
        // Personal Information
        firstName: $form.find('[data-donate="first-name"]').val(),
        lastName: $form.find('[data-donate="last-name"]').val(),
        email: $form.find('[data-donate="email"]').val(),
        phone: $form.find('[data-donate="phone"]').val(),

        // Address
        countryId: $form.find('[data-donate="country"]').val(),
        address: $form.find('[data-donate="address"]').val(),
        address2: $form.find('[data-donate="address-2"]').val(),
        city: $form.find('[data-donate="city"]').val(),
        regionId: $form.find('[data-donate="region"]').val(),
        postCode: $form.find('[data-donate="post-code"]').val(),

        // Organization
        organization: $form.find('[data-donate="company-name"]').val(),

        // Payment
        cardholderName: $form.find('[data-donate="cardholder-name"]').val(),

        // Tribute
        tributeeFirstName: $form.find('[data-donate="tributee-first-name"]').val(),
        tributeeLastName: $form.find('[data-donate="tributee-last-name"]').val(),

        // Checkboxes
        inHonour: $form.find('[data-donate="dedicate-this-donation"] input[type=checkbox]').is(':checked'),
        inMemory: $form.find('[data-donate="dedicate-in-memory"] input[type=checkbox]').is(':checked'),
        isDonatingOnBehalfOfCompany: $form.find('[data-donate="donate-company"] input[type=checkbox]').is(':checked'),
        isAdminFee: $form.find('[data-donate="admin-cost"] input[type=checkbox]').is(':checked'),
        optOutOfCommunications: $form.find('[data-donate="opt-out"] input[type=checkbox]').is(':checked'),
        isAnonymousDonation: $form.find('[data-donate="donate-anonymously"] input[type=checkbox]').is(':checked'),

        // Frequency
        frequency: $form.find('[data-donate="frequency"] input:checked').val().toLowerCase().trim(),

        // Donation Amount
        donationAmount: (() => {
          const selectedAmount = $form.find('[data-donate="amount"] input:checked').val().trim();
          if (selectedAmount === 'Other') {
            return $form.find('[data-donate="other-amount"]').val().trim().replace('$', '');
          }
          return selectedAmount.replace('$', '');
        })(),
      };

      return utils.trimFormValues(fields);
    },

    getDonationType(formData) {
      const { frequency, inHonour, inMemory } = formData;
      const isDedicated = inHonour || inMemory;

      if (!isDedicated) {
        return DONATION_TYPES.general[frequency] || DONATION_TYPES.general['one-time'];
      }

      const type = inMemory ? 'memory' : 'honour';
      return DONATION_TYPES[type][frequency] || DONATION_TYPES[type]['one-time'];
    },
  };

  /**
   * API Functions
   */
  const api = {
    getJWTToken() {
      return $.ajax({
        url: CONFIG.urls.authentication,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          organizationId: CONFIG.organizationId,
          subEventCustomPart: state.subEventCustomPart,
        }),
      });
    },

    submitDonation(data) {
      return $.ajax({
        url: CONFIG.urls.constituentApi,
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + state.jwtToken,
          'Content-Type': 'application/json',
        },
        data: JSON.stringify(data),
      });
    },

    initializePayPal(payload, returnUrl, cancelUrl) {
      return $.ajax({
        url: `${CONFIG.urls.paypalInit}?returnUrl=${encodeURIComponent(returnUrl)}&cancelUrl=${encodeURIComponent(cancelUrl)}`,
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + state.jwtToken,
          'Content-Type': 'application/json',
        },
        data: JSON.stringify(payload),
        dataType: 'json',
      });
    },
  };

  /**
   * Donation Data Builders
   */
  const dataBuilders = {
    buildProfile(formData) {
      return {
        contactType: formData.isDonatingOnBehalfOfCompany ? 1 : 0,
        address: {
          countryId: parseInt(formData.countryId, 10),
          addressType: '1',
          line1: formData.address,
          line2: formData.address2 || null,
          city: formData.city,
          regionId: parseInt(formData.regionId, 10),
          postalCode: formData.postCode,
        },
        accountInfo: null,
        correspondanceLanguage: state.isFrench ? 2 : 1,
        interfaceLanguage: state.isFrench ? 2 : 1,
        userId: 0,
        title: '',
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: utils.formatPhoneNumber(formData.phone),
        gender: '',
        organization: formData.isDonatingOnBehalfOfCompany ? formData.organization : '',
        receiveCommunications: !formData.optOutOfCommunications,
        allowDistributionOfDetails: formData.isAnonymousDonation,
        isCharityOrg: formData.isDonatingOnBehalfOfCompany,
      };
    },

    buildPaymentDetails(paypalData = null, monerisData = null, formData = null) {
      const baseDetails = {
        cardNumber: null,
        cardHolderName: '',
        cardExpiration: null,
        cardType: 0,
        billingProfile: null,
        cardExpirationDate: null,
        cardTypeTitle: null,
        creditCardNumberMasked: null,
        cvv: null,
        isVisaCheckOutAllowed: false,
        reCaptchaError: null,
        transactionAttribute: null,
      };

      if (paypalData) {
        return {
          ...baseDetails,
          payPalCurrency: paypalData.payPalCurrency,
          payPalPayerId: paypalData.payPalPayerId,
          payPalToken: paypalData.payPalToken,
          payPalTotalAmount: paypalData.payPalTotalAmount,
          paymentMethod: paypalData.paymentMethod,
        };
      }

      if (monerisData) {
        return {
          ...baseDetails,
          cardNumber: monerisData.bin,
          cardHolderName: formData.cardholderName,
          cardExpiration: monerisData.cardExpiration,
          cardType: utils.getCardType(monerisData.bin),
          billingProfile: dataBuilders.buildProfile(formData),
          cardExpirationDate: monerisData.cardExpirationDate,
          cardTypeTitle: monerisData.cardTypeTitle,
          creditCardNumberMasked: monerisData.creditCardNumberMasked,
          cvv: monerisData.cvv,
          isVisaCheckOutAllowed: monerisData.isVisaCheckOutAllowed,
          reCaptchaError: monerisData.reCaptchaError,
          transactionAttribute: monerisData.transactionAttribute,
        };
      }

      return {
        ...baseDetails,
        payPalCurrency: null,
        payPalPayerId: null,
        payPalToken: null,
        payPalTotalAmount: 0,
        paymentMethod: 0,
      };
    },

    buildPurchaseItems(formData, donationAmount, donationType, isPayPal = false) {
      const items = [
        {
          promoCode: null,
          itemId: 0,
          typeLabel: 'Donation',
          category: 'Donation',
          category2: '',
          category3: '',
          registrationFee: 0,
          minFundRaisingGoal: 0,
          suggestedFundRaisingGoal: 0,
          name: '',
          type: donationType,
          $type: 'GeneralDonationItem',
          quantity: 1,
          donationAmount: parseFloat(donationAmount),
          isSelfDonation: false,
          eventTypeId: isPayPal ? 3 : 11, // 3 for PayPal, 11 for credit card
          subEventGroupId: null,
          sponsoredEntityType: CONFIG.sponsoredEntityTypes.Event,
          sponsoredEntityId: 34694,
          sponsoredEntityName: 'FY25 YE Appeal - Webpage',
          fundId: 10444,
          otherFundName: '',
          tribute: null,
        },
      ];

      // Add admin fee if applicable
      if (formData.isAdminFee) {
        const adminFeeAmount = Math.min(parseFloat(donationAmount) * 0.02, 5.0);
        const roundedFee = Math.round(adminFeeAmount * 100) / 100;

        if (roundedFee > 0) {
          items.push({
            promoCode: null,
            itemId: 0,
            typeLabel: 'AdminFee',
            category: 'Admin Fee',
            category2: '',
            category3: '',
            registrationFee: 0,
            minFundRaisingGoal: 0,
            suggestedFundRaisingGoal: 0,
            name: '',
            adminFeeAmount: roundedFee,
            type: 29,
            $type: 'AdminFeeItem',
          });
        }
      }

      // Add tribute information if applicable
      if ((formData.inHonour || formData.inMemory) && formData.tributeeFirstName) {
        items[0].tribute = dataBuilders.buildTribute(formData);
      }

      return items;
    },

    buildTribute(formData) {
      const tribute = {
        firstName: formData.tributeeFirstName,
        lastName: formData.tributeeLastName || '',
      };

      // Add eCard if selected
      const $form = state.currentForm;
      if ($form.find('[data-donate="ecard-selection"] input:checked').val() === 'e-card') {
        const templateId =
          parseInt($form.find('[data-donate="ecard-design"] input:checked').val(), 10) || parseInt($form.find('[data-donate="ecard-design"] input:visible:first').val(), 10);

        tribute.eCard = {
          templateId: templateId,
          message: $form.find('[data-donate="message"]').val().trim(),
          deliveryDate: $form.find('[data-donate="date"]').val().trim(),
          recipients: dataBuilders.buildEcardRecipients($form),
        };
      }

      return tribute;
    },

    buildEcardRecipients($form) {
      return $form
        .find('[data-donate="add"]')
        .map(function () {
          const $block = $(this);
          const email = $block.find('[data-donate="recipient-email"]').val().trim();
          const firstName = $block.find('[data-donate="recipient-first-name"]').val().trim();
          const lastName = $block.find('[data-donate="recipient-last-name"]').val().trim();

          if (email && firstName) {
            return {
              firstName: firstName,
              lastName: lastName || '',
              email: email,
            };
          }
        })
        .get();
    },
  };

  /**
   * UI Functions
   */
  const ui = {
    showDonateForm($form) {
      // Check if this is a modal form
      const $modal = $form.closest('[data-modal="item"]');

      if ($modal.length) {
        // This is a modal form - trigger the existing modal opening logic
        // Find the specific donate button using the parent class
        const $openButton = $('.nav_form_btn [data-modal="true"]').first();

        if ($openButton.length) {
          $openButton.trigger('click');
        } else {
          // Fallback: create a temporary timeline if no button exists
          const tl = gsap.timeline({ paused: true });
          tl.set($modal, { display: 'flex' });
          tl.fromTo($modal, { opacity: 0 }, { opacity: 1, duration: 0.3 });
          tl.play();
        }
      }
    },

    hideDonationFormAndShowSuccess(frequency = 'one-time') {
      // Hide the donation form
      $('[data-name="Donation Form"]').hide();

      // Show the appropriate success screen
      if (frequency === 'one-time') {
        $('[data-donate="success-otg"]').show();
        $('[data-donate="success-monthly"]').hide();
      } else if (frequency === 'monthly') {
        $('[data-donate="success-monthly"]').show();
        $('[data-donate="success-otg"]').hide();
      }
    },

    showSuccessScreen(frequency = 'one-time') {
      // Show the appropriate success screen based on frequency
      if (frequency === 'one-time') {
        $('[data-donate="success-otg"]').show();
        $('[data-donate="success-monthly"]').hide();
      } else if (frequency === 'monthly') {
        $('[data-donate="success-monthly"]').show();
        $('[data-donate="success-otg"]').hide();
      }
    },

    toggleProcessing(isProcessing) {
      state.isProcessing = isProcessing;
      $('body').toggleClass('form-submitting', isProcessing);
    },

    showError($form, message) {
      $form.find('#cc-error').text(message).show();
      $form.find('[data-donate="complete-button"]').prop('disabled', false);
      $form.find('[data-donate="complete-button"] .btn_main_text').text('Donate');
      ui.toggleProcessing(false);
    },

    updateEcardDesigns(tributeType) {
      const cardMappings = {
        honour: {
          english: ['3320', '2331', '2332'],
          french: ['3326'],
        },
        memory: {
          english: ['3324', '2333'],
          french: ['3328'],
        },
      };

      const relevantCardIds = state.isFrench ? cardMappings[tributeType].french : cardMappings[tributeType].english;

      $('[data-donate="ecard-design"]').hide();

      relevantCardIds.forEach((id) => {
        $(`[data-donate="ecard-design"] input[value="${id}"]`).closest('[data-donate="ecard-design"]').show();
      });

      const visibleCards = $('[data-donate="ecard-design"]:visible');
      const selectedCard = $('[data-donate="ecard-design"] input:checked:visible');

      if (visibleCards.length > 0 && selectedCard.length === 0) {
        visibleCards.first().find('input[type="radio"]').prop('checked', true);
      }
    },
  };

  /**
   * Payment Processing
   */
  const paymentProcessors = {
    async processCreditCard($form) {
      try {
        state.jwtToken = await api.getJWTToken();
        const formData = formHelpers.getFormData($form);
        const donationType = formHelpers.getDonationType(formData);

        const donationData = {
          profile: dataBuilders.buildProfile(formData),
          paymentDetails: dataBuilders.buildPaymentDetails({
            cardNumber: state.monerisBin,
            cardHolderName: formData.cardholderName,
            cardType: utils.getCardType(state.monerisBin),
            paymentMethod: 0,
            payPalToken: '',
            payPalPayerId: '',
            payPalTotalAmount: 0,
            payPalCurrency: '',
            isVisaCheckOutAllowed: false,
            reCaptchaError: '',
          }),
          purchaseItems: dataBuilders.buildPurchaseItems(formData, formData.donationAmount, donationType, false), // Credit card
          surveys: [],
          returningUserId: null,
          importSubEventId: null,
          failedTransactionUserId: null,
          authorizedRole: null,
          subEventGroupId: null,
          isAskedToCoverAdminFee: true,
        };

        const response = await api.submitDonation(donationData);
        return paymentProcessors.handleDonationResponse(response, formData.frequency);
      } catch (error) {
        paymentProcessors.handleError(error, $form);
        throw error;
      }
    },

    async processPayPal($form) {
      const transactionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      const formId = $form.attr('id') || `donation-form-${Date.now()}`;

      if (!$form.attr('id')) {
        $form.attr('id', formId);
      }

      // Store form data for retrieval after PayPal redirect
      const formData = formHelpers.getFormData($form);
      const storedData = {
        formSelector: `#${formId}`,
        formData: formData,
        timestamp: Date.now(),
        formHtml: $form.prop('outerHTML'),
      };

      sessionStorage.setItem(`paypal_${transactionId}`, JSON.stringify(storedData));

      // Generate URLs
      const currentUrl = window.location.href.split('?')[0];
      const returnUrl = `${currentUrl}?jack_donation=success&txid=${transactionId}`;
      const cancelUrl = `${currentUrl}?jack_donation=cancel`;

      try {
        state.jwtToken = await api.getJWTToken();
        const payload = paymentProcessors.createPayPalPayload($form, formData.donationAmount);

        const response = await api.initializePayPal(payload, returnUrl, cancelUrl);

        if (response?.PayPalUrl || response?.payPalUrl) {
          window.location.href = response.PayPalUrl || response.payPalUrl;
        } else {
          throw new Error('Invalid PayPal response: Missing PayPal URL');
        }
      } catch (error) {
        ui.showError($form, 'Failed to initialize PayPal payment. Please try again.');
        paymentProcessors.handleError(error, $form);
      }
    },

    createPayPalPayload($form, donationAmount) {
      const formData = formHelpers.getFormData($form);
      const donationType = formHelpers.getDonationType(formData);

      return [
        {
          profile: dataBuilders.buildProfile(formData),
          paymentDetails: dataBuilders.buildPaymentDetails({
            payPalCurrency: 'CAD',
            payPalPayerId: null,
            payPalToken: null,
            payPalTotalAmount: 0,
            paymentMethod: 1,
          }),
          purchaseItems: dataBuilders.buildPurchaseItems(formData, donationAmount, donationType, true), // PayPal
          surveys: [],
          returningUserId: null,
          importSubEventId: null,
          failedTransactionUserId: null,
          authorizedRole: null,
          subEventGroupId: null,
          isAskedToCoverAdminFee: true,
        },
      ];
    },

    async handlePayPalReturn() {
      const payPalToken = utils.getUrlParameter('token');
      const payPalPayerId = utils.getUrlParameter('PayerID');
      const transactionId = utils.getUrlParameter('txid');

      if (!payPalToken || !payPalPayerId || !transactionId) {
        return false;
      }

      const storedDataStr = sessionStorage.getItem(`paypal_${transactionId}`);
      if (!storedDataStr) {
        console.error('No stored PayPal data found for transaction:', transactionId);
        return false;
      }

      try {
        const storedData = JSON.parse(storedDataStr);
        const $form = paymentProcessors.findPayPalForm(storedData);

        if (!$form || !$form.length) {
          throw new Error('Could not find donation form');
        }

        //show donate form
        ui.showDonateForm($form);

        state.currentForm = $form;
        ui.toggleProcessing(true);
        $form.find('[data-donate="complete-button"]').prop('disabled', true);
        $form.find('[data-donate="complete-button"] .btn_main_text').text('Processing...');

        state.jwtToken = await api.getJWTToken();

        const formData = storedData.formData; // Use the stored form data directly
        const donationType = formHelpers.getDonationType(formData);

        const paypalData = {
          payPalToken: payPalToken,
          payPalPayerId: payPalPayerId,
          payPalTotalAmount: parseFloat(formData.donationAmount),
          payPalCurrency: 'CAD',
          paymentMethod: 1,
        };

        const donationData = {
          profile: dataBuilders.buildProfile(formData),
          paymentDetails: dataBuilders.buildPaymentDetails(paypalData),
          purchaseItems: dataBuilders.buildPurchaseItems(formData, formData.donationAmount, donationType, true), // PayPal
          surveys: [],
          returningUserId: null,
          importSubEventId: null,
          failedTransactionUserId: null,
          authorizedRole: null,
          subEventGroupId: null,
          isAskedToCoverAdminFee: true,
        };

        const response = await api.submitDonation(donationData);
        sessionStorage.removeItem(`paypal_${transactionId}`);

        // Clear URL parameters after successful processing
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('token');
        currentUrl.searchParams.delete('PayerID');
        currentUrl.searchParams.delete('txid');
        currentUrl.searchParams.delete('jack_donation');

        // Update browser history without the PayPal parameters
        window.history.replaceState({}, document.title, currentUrl.toString());

        return paymentProcessors.handleDonationResponse(response, formData.frequency);
      } catch (error) {
        const $form = state.currentForm;
        if ($form) {
          ui.showError($form, 'There was an error processing your PayPal payment. Please try again or contact support.');
        }
        paymentProcessors.handleError(error, $form);
        return false;
      }
    },

    findPayPalForm(storedData) {
      // Try multiple methods to find the form
      let $form = $(storedData.formSelector);

      if (!$form.length) {
        $form = $('form')
          .filter(function () {
            return $(this).find('[data-donate="complete-button"]').length > 0;
          })
          .first();
      }

      return $form;
    },

    handleDonationResponse(response, frequency) {
      let parsedResponse = response;
      if (typeof response === 'string') {
        try {
          parsedResponse = JSON.parse(response);
        } catch (e) {
          throw new Error('Invalid response format');
        }
      }

      if (parsedResponse.Success === true) {
        const txCode = parsedResponse.Result.Transaction.TxCode;
        $('[data-donate="transaction-number"]').text(txCode);
        ui.showSuccessScreen(frequency);
        ui.toggleProcessing(false);
        return parsedResponse;
      } else {
        // Log error to Sentry with transaction details
        if (typeof Sentry !== 'undefined') {
          Sentry.withScope(function (scope) {
            // Add payment specific error details
            scope.setExtra('errorCode', parsedResponse.exception?.code);
            scope.setExtra('errorMessage', parsedResponse.exception?.message);
            scope.setExtra('paymentStatus', parsedResponse.result?.paymentStatus);
            scope.setExtra('paymentReason', parsedResponse.result?.reason);
            scope.setExtra('transactionCode', parsedResponse.result?.transactionCode);
            scope.setExtra('createdUserId', parsedResponse.result?.createdUserId);
            scope.setExtra('fullResponse', JSON.stringify(parsedResponse));

            // Set error level based on payment decline
            scope.setLevel(parsedResponse.exception?.code === 4020 ? 'warning' : 'error');

            Sentry.captureMessage(parsedResponse.exception?.code === 4020 ? 'Payment declined by payment processor' : 'Donation API returned failure response');
          });
        }
        throw new Error(`Donation failed: ${JSON.stringify(parsedResponse)}`);
      }
    },

    handleError(error, $form) {
      console.error('Payment error:', error);

      if (typeof Sentry !== 'undefined') {
        Sentry.captureException(error);
      }

      // Log to Zapier
      paymentProcessors.logErrorToZapier(error);
    },

    logErrorToZapier(error) {
      fetch('https://ipapi.co/json/')
        .then((res) => res.json())
        .then((ipData) => {
          const formData = new FormData();
          formData.append('zapInfo', 'I3lM8dLSiA');
          formData.append('error', error.message || 'Unknown error');
          formData.append('timestamp', new Date().toISOString());
          formData.append('userAgent', navigator.userAgent);
          formData.append('language', navigator.language);
          formData.append('platform', navigator.platform);
          formData.append('pageUrl', window.location.href);
          formData.append('ip', ipData.ip);
          formData.append('city', ipData.city);
          formData.append('region', ipData.region);
          formData.append('country', ipData.country_name);
          formData.append('latitude', ipData.latitude);
          formData.append('longitude', ipData.longitude);

          return fetch('https://hooks.zapier.com/hooks/catch/21900682/2q7wn2c/', {
            method: 'POST',
            body: formData,
          });
        })
        .catch(console.error);
    },
  };

  /**
   * Moneris Credit Card Processing
   */
  const monerisHandler = {
    initiate() {
      const ccFrameRef = document.getElementById('monerisFrame').contentWindow;
      ccFrameRef.postMessage('tokenize', CONFIG.urls.monerisToken);
      return false;
    },

    handleResponse(e) {
      if (!e.origin.includes('moneris.com')) return;

      const respData = JSON.parse(e.data);
      const responseCode = Array.isArray(respData.responseCode) ? respData.responseCode[0] : respData.responseCode;

      switch (responseCode) {
        case '001':
          monerisHandler.handleSuccess(respData);
          break;
        case '943':
          ui.showError(state.currentForm, 'Card data is invalid.');
          break;
        case '944':
          ui.showError(state.currentForm, 'Invalid expiration date (MMYY, must be a future date).');
          break;
        case '945':
          ui.showError(state.currentForm, 'Invalid CVD data (not 3-4 digits).');
          break;
        default:
          ui.showError(state.currentForm, 'Error saving credit card, please contact us donate@jack.org');
      }
    },

    async handleSuccess(respData) {
      state.currentForm.find('#data-key').val(respData.dataKey);
      state.monerisDataKey = respData.dataKey;
      state.monerisBin = respData.bin;

      try {
        state.jwtToken = await api.getJWTToken();
        const formData = formHelpers.getFormData(state.currentForm);
        const donationType = formHelpers.getDonationType(formData);

        const monerisData = {
          dataKey: respData.dataKey,
          bin: respData.bin,
        };

        const donationData = {
          profile: dataBuilders.buildProfile(formData),
          paymentDetails: dataBuilders.buildPaymentDetails(null, monerisData, formData),
          purchaseItems: dataBuilders.buildPurchaseItems(formData, formData.donationAmount, donationType, false), // Credit card
          surveys: [],
          returningUserId: null,
          importSubEventId: null,
          failedTransactionUserId: null,
          authorizedRole: null,
          subEventGroupId: null,
          isAskedToCoverAdminFee: true,
        };

        const response = await api.submitDonation(donationData);
        const parsedResponse = paymentProcessors.handleDonationResponse(response, formData.frequency);
        state.currentForm.submit();
        return true;
      } catch (error) {
        let errorMessage = `We're experiencing technical difficulties. Please try to donate at: ${CONFIG.urls.fallbackDonation}`;

        if (error && error.Exception && error.Exception.Message === 'Payment declined.') {
          errorMessage = 'Your payment was declined. Please check your card details and try again, or use a different payment method.';
        }

        // Fire Sentry for error tracking
        if (typeof Sentry !== 'undefined') {
          Sentry.captureMessage('User failed to submit donation', 'error');
        }

        // Get the IP and location info
        fetch('https://ipapi.co/json/')
          .then((res) => res.json())
          .then((ipData) => {
            const formData = new FormData();

            formData.append('zapInfo', 'I3lM8dLSiA');
            // Add error info
            formData.append('error', errorMessage);
            formData.append('timestamp', new Date().toISOString());

            // Add browser info
            formData.append('userAgent', navigator.userAgent);
            formData.append('language', navigator.language);
            formData.append('platform', navigator.platform);
            formData.append('pageUrl', window.location.href);

            // Add IP/location info
            formData.append('ip', ipData.ip);
            formData.append('city', ipData.city);
            formData.append('region', ipData.region);
            formData.append('country', ipData.country_name);
            formData.append('latitude', ipData.latitude);
            formData.append('longitude', ipData.longitude);

            // Send to Zapier
            fetch('https://hooks.zapier.com/hooks/catch/21900682/2q7wn2c/', {
              method: 'POST',
              body: formData,
            }).catch(() => {
              if (typeof Sentry !== 'undefined') {
                Sentry.captureMessage('Capture user data failed', 'error');
              }
            });
          })
          .catch(() => {
            if (typeof Sentry !== 'undefined') {
              Sentry.captureMessage('User failed to submit donation', 'error');
            }
          });

        ui.showError(state.currentForm, errorMessage);
        paymentProcessors.handleError(error, state.currentForm);
      }
    },
  };

  /**
   * Event Handlers
   */
  const eventHandlers = {
    init() {
      // Tribute checkboxes
      $('[data-donate="dedicate-this-donation"] input[type=checkbox]').on('change', function () {
        if ($(this).is(':checked')) {
          ui.updateEcardDesigns('honour');
        }
      });

      $('[data-donate="dedicate-in-memory"] input[type=checkbox]').on('change', function () {
        if ($(this).is(':checked')) {
          ui.updateEcardDesigns('memory');
        }
      });

      // Payment method selection
      $(document).on('change', '[data-donate="payment-method"] input[type="radio"]', function () {
        const paymentMethod = $(this).val();
        $('[data-donate="credit-card-fields"]').toggle(paymentMethod === 'credit-card');
        $('[data-donate="paypal-fields"]').toggle(paymentMethod === 'paypal');
      });

      // PayPal button
      $(document).on('click', '[data-donate="paypal-button"]', function (e) {
        e.preventDefault();
        if (state.isProcessing) return;

        const $form = $(this).closest('form');
        $(this).css('opacity', '0.5');
        $(this).prop('disabled', true);
        state.currentForm = $form;
        paymentProcessors.processPayPal($form);
      });

      // Credit card submit button
      $(document).on('click', '[data-donate="complete-button"]', function (e) {
        e.preventDefault();
        if (state.isProcessing) return;

        const $form = $(this).closest('form');
        $(this).prop('disabled', true);
        ui.toggleProcessing(true);
        $form.find('[data-donate="complete-button"] .btn_main_text').text('Processing...');
        state.currentForm = $form;
        monerisHandler.initiate();
      });

      // Moneris message handler
      if (window.addEventListener) {
        window.addEventListener('message', monerisHandler.handleResponse, false);
      } else if (window.attachEvent) {
        window.attachEvent('onmessage', monerisHandler.handleResponse);
      }
    },
  };

  /**
   * Initialization
   */
  const init = async () => {
    // Set up UTM source mapping
    const utmSource = utils.getUrlParameter('utm_source');
    if (utmSource && CONFIG.utmSourceMapping[utmSource]) {
      state.subEventCustomPart = CONFIG.utmSourceMapping[utmSource];
    }

    // Check language
    const utmId = utils.getUrlParameter('utm_id');
    if (utmId === 'fr' || $('html').attr('lang') === 'fr') {
      state.isFrench = true;
      state.subEventCustomPart += 'FR';
    }

    // Check if returning from PayPal
    const isPayPalReturn = await paymentProcessors.handlePayPalReturn();

    // Only initialize event handlers if not processing PayPal return
    //    //ToDo: may need this even if it's a paypal return
    if (!isPayPalReturn) {
      eventHandlers.init();
    }
  };

  // Start the application
  init();
});
