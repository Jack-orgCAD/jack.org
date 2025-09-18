$(document).ready(function () {
    console.log('🔵 Donation form script loaded');
    console.log('🔵 Document ready, checking for donation form...');
  
    // Skip initialization if no donation form exists
    if (!$("[data-donate='complete-button']").length) {
      console.log('🔵 No donation form found, exiting');
      return;
    }
  
    console.log('🔵 Donation form found, proceeding with initialization');
    console.log('🔵 Current URL:', window.location.href);
    console.log('🔵 URL parameters:', window.location.search);
  
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
      defaultSubEvent: 'donatenow',
      sponsoredEntityTypes: {
        Event: 1,
        Team: 2,
        Participant: 3,
        Group: 4,
      },
      utmSourceMapping: {
        '20981': 'donatenow'
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
        const value = results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
        console.log('🔵 getUrlParameter:', { name, value });
        return value;
      },
  
      formatPhoneNumber(phone) {
        if (!phone) return '';
        const digits = phone.replace(/\D/g, '');
        const formatted = digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
        console.log('🔵 formatPhoneNumber:', { phone, formatted });
        return formatted;
      },
  
      trimFormValues(obj) {
        const trimmed = {};
        Object.keys(obj).forEach((key) => {
          trimmed[key] = typeof obj[key] === 'string' ? obj[key].trim() : obj[key];
        });
        console.log('🔵 trimFormValues:', { original: obj, trimmed });
        return trimmed;
      },
  
      getCardType(bin) {
        const binStr = bin.toString();
        let cardType = 0;
  
        if (/^5[1-5]/.test(binStr)) cardType = 1; // MasterCard
        else if (/^4/.test(binStr)) cardType = 2; // VISA
        else if (/^3[47]/.test(binStr)) cardType = 3; // AMEX
        else if (/^3[68]/.test(binStr)) cardType = 4; // Diners Club
        else if (/^6011|^65/.test(binStr)) cardType = 5; // Discover
  
        console.log('🔵 getCardType:', { bin, cardType });
        return cardType;
      },
    };
  
    /**
     * Form Data Collection
     */
    const formHelpers = {
      getFormData($form) {
        console.log('🔵 getFormData called for form:', $form.attr('id'));
  
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
  
        const trimmedFields = utils.trimFormValues(fields);
        console.log('🔵 Form data collected:', trimmedFields);
        return trimmedFields;
      },
  
      getDonationType(formData) {
        const { frequency, inHonour, inMemory } = formData;
        const isDedicated = inHonour || inMemory;
  
        let donationType;
        if (!isDedicated) {
          donationType = DONATION_TYPES.general[frequency] || DONATION_TYPES.general['one-time'];
        } else {
          const type = inMemory ? 'memory' : 'honour';
          donationType = DONATION_TYPES[type][frequency] || DONATION_TYPES[type]['one-time'];
        }
  
        console.log('🔵 getDonationType:', { frequency, inHonour, inMemory, isDedicated, donationType });
        return donationType;
      },
    };
  
    /**
     * API Functions
     */
    const api = {
      getJWTToken() {
        console.log('🔵 getJWTToken called');
        return $.ajax({
          url: CONFIG.urls.authentication,
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({
            organizationId: CONFIG.organizationId,
            subEventCustomPart: state.subEventCustomPart,
          }),
        })
          .then((response) => {
            console.log('🔵 JWT token response:', response);
            return response;
          })
          .catch((error) => {
            console.error('🔴 JWT token error:', error);
            throw error;
          });
      },
  
      submitDonation(data) {
        console.log('🔵 submitDonation called with data:', data);
        return $.ajax({
          url: CONFIG.urls.constituentApi,
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + state.jwtToken,
            'Content-Type': 'application/json',
          },
          data: JSON.stringify(data),
        })
          .then((response) => {
            console.log('🔵 Donation submission response:', response);
            return response;
          })
          .catch((error) => {
            console.error('🔴 Donation submission error:', error);
            throw error;
          });
      },
  
      initializePayPal(payload, returnUrl, cancelUrl) {
        console.log('🔵 initializePayPal called', { payload, returnUrl, cancelUrl });
        return $.ajax({
          url: `${CONFIG.urls.paypalInit}?returnUrl=${encodeURIComponent(returnUrl)}&cancelUrl=${encodeURIComponent(cancelUrl)}`,
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + state.jwtToken,
            'Content-Type': 'application/json',
          },
          data: JSON.stringify(payload),
          dataType: 'json',
        })
          .then((response) => {
            console.log('🔵 PayPal initialization response:', response);
            return response;
          })
          .catch((error) => {
            console.error('🔴 PayPal initialization error:', error);
            throw error;
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
          console.log('🔵 Building PayPal payment details');
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
          console.log('🔵 Building Moneris payment details:', monerisData);
  
          const paymentDetails = {
            paymentToken: monerisData.dataKey,
            cardNumber: monerisData.bin,
            cardHolderName: formData.cardholderName || '',
            cardType: utils.getCardType(monerisData.bin),
            paymentMethod: 0,
            payPalToken: '',
            payPalPayerId: '',
            payPalTotalAmount: 0,
            payPalCurrency: '',
            isVisaCheckOutAllowed: false,
            reCaptchaError: '',
          };
  
          console.log('🔵 Moneris payment details built:', paymentDetails);
          return paymentDetails;
        }
  
        console.log('🔵 Building default payment details');
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
            quantity: 1,
            donationAmount: parseFloat(donationAmount),
            fundId: 10444,
            otherFundName: '',
            tribute: null,
            eventTypeId: isPayPal ? 3 : 11, // 3 for PayPal, 11 for credit card
            $type: 'GeneralDonationItem',
            isSelfDonation: false,
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
        console.log('🔵 showDonateForm called', { $form: $form.length, formId: $form.attr('id') });
  
        // Check if this is a modal form
        const $modal = $form.closest('[data-modal="item"]');
        console.log('🔵 Modal check:', { isModal: $modal.length > 0, modalId: $modal.attr('id') });
  
        if ($modal.length) {
          // This is a modal form - trigger the existing modal opening logic
          // Find the specific donate button using the parent class
          const $openButton = $('.nav_form_btn [data-modal="true"]').first();
          console.log('🔵 Looking for modal open button:', { found: $openButton.length, buttonId: $openButton.attr('id') });
  
          if ($openButton.length) {
            console.log('🔵 Triggering modal open button click');
            $openButton.trigger('click');
          } else {
            console.log('🔵 No modal button found, creating temporary timeline');
            // Fallback: create a temporary timeline if no button exists
            const tl = gsap.timeline({ paused: true });
            tl.set($modal, { display: 'flex' });
            tl.fromTo($modal, { opacity: 0 }, { opacity: 1, duration: 0.3 });
            tl.play();
          }
        } else {
          console.log('🔵 Not a modal form, no action needed');
        }
      },
  
      hideDonationFormAndShowSuccess(frequency = 'one-time') {
        console.log('🔵 hideDonationFormAndShowSuccess called', { frequency });
  
        // Hide the donation form
        $('[data-name="Donation Form"], .nav_form_progress_wrap').hide();
        console.log('🔵 Hide donation form');
  
        // Show success message
        $('.w-form-done').show();
        console.log('🔵 Showing form success message');
        // Show the appropriate success screen
        if (frequency === 'one-time') {
          $('[data-donate="success-otg"]').show();
          $('[data-donate="success-monthly"]').hide();
          console.log('🔵 Showing one-time success screen');
        } else if (frequency === 'monthly') {
          $('[data-donate="success-monthly"]').show();
          $('[data-donate="success-otg"]').hide();
  
          console.log('🔵 Showing monthly success screen');
        }
        // let txCode = parsedResponse?.Result?.Transaction?.TxCode || "unknown"; // Extract transaction ID from response
        // let donationAmount = parseFloat(formData?.donationAmount || 0); // Extract donation amount from form data
        // let isFrench = state?.isFrench || false; // Use state to determine language

        // Push donation data to dataLayer for Google Tag Manager
        // window.dataLayer = window.dataLayer || [];
        // dataLayer.push({
        //   event: "purchase",
        //   ecommerce: {
        //     transaction_id: txCode,
        //     value: donationAmount,
        //     tax: 0.00,
        //     shipping: 0.00,
        //     currency: "CAD",
        //     items: [
        //       {
        //         item_id: frequency + " - " + donationAmount,
        //         item_name: "donation",
        //         affiliation: isFrench ? "fr" : "en",
        //         price: donationAmount,
        //         quantity: 1
        //       }
        //     ]
        //   }
        // });
      },
  
      showSuccessScreen(frequency = 'one-time') {
        console.log('🔵 showSuccessScreen called', { frequency });
  
        // Show the appropriate success screen based on frequency
        if (frequency === 'one-time') {
          $('[data-donate="success-otg"]').show();
          $('[data-donate="success-monthly"]').hide();
          console.log('🔵 Showing one-time success screen');
        } else if (frequency === 'monthly') {
          $('[data-donate="success-monthly"]').show();
          $('[data-donate="success-otg"]').hide();
          console.log('🔵 Showing monthly success screen');
        }
        // let txCode = parsedResponse?.Result?.Transaction?.TxCode || "unknown"; // Extract transaction ID from response
        // let donationAmount = parseFloat(formData?.donationAmount || 0); // Extract donation amount from form data
        // let isFrench = state?.isFrench || false; // Use state to determine language

        // Push donation data to dataLayer for Google Tag Manager
        // window.dataLayer = window.dataLayer || [];
        // dataLayer.push({
        //   event: "purchase",
        //   ecommerce: {
        //     transaction_id: txCode,
        //     value: donationAmount,
        //     tax: 0.00,
        //     shipping: 0.00,
        //     currency: "CAD",
        //     items: [
        //       {
        //         item_id: frequency + " - " + donationAmount,
        //         item_name: "donation",
        //         affiliation: isFrench ? "fr" : "en",
        //         price: donationAmount,
        //         quantity: 1
        //       }
        //     ]
        //   }
        // });
      },
  
      toggleProcessing(isProcessing) {
        console.log('🔵 toggleProcessing called', { isProcessing });
        state.isProcessing = isProcessing;
        $('body').toggleClass('form-submitting', isProcessing);
        console.log('🔵 Processing state updated');
      },
  
      showError($form, message) {
        console.log('🔵 showError called', { message, formId: $form?.attr('id') });
        $form.find('#cc-error').text(message).show();
        $form.find('[data-donate="complete-button"]').prop('disabled', false);
        $form.find('[data-donate="complete-button"] .btn_main_text').text('Donate');
        ui.toggleProcessing(false);
        console.log('🔵 Error displayed on form');
      },
  
      updateEcardDesigns(tributeType) {
        console.log('🔵 updateEcardDesigns called', { tributeType });
  
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
        console.log('🔵 Relevant card IDs:', relevantCardIds);
  
        $('[data-donate="ecard-design"]').hide();
  
        relevantCardIds.forEach((id) => {
          $(`[data-donate="ecard-design"] input[value="${id}"]`).closest('[data-donate="ecard-design"]').show();
        });
  
        const visibleCards = $('[data-donate="ecard-design"]:visible');
        const selectedCard = $('[data-donate="ecard-design"] input:checked:visible');
  
        if (visibleCards.length > 0 && selectedCard.length === 0) {
          visibleCards.first().find('input[type="radio"]').prop('checked', true);
        }
  
        console.log('🔵 Ecard designs updated');
      },
    };
  
    /**
     * Payment Processing
     */
    const paymentProcessors = {
      async processCreditCard($form) {
        console.log('🔵 processCreditCard called');
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
        console.log('🔵 processPayPal called', { $form: $form.length, formId: $form.attr('id') });
  
        const formId = $form.attr('id') || `donation-form-${Date.now()}`;
  
        console.log('🔵 Form ID:', formId);
  
        if (!$form.attr('id')) {
          $form.attr('id', formId);
          console.log('🔵 Set form ID to:', formId);
        }
  
        // Store form data for retrieval after PayPal redirect
        const formData = formHelpers.getFormData($form);
        console.log('🔵 Form data collected:', formData);
  
        const storedData = {
          formSelector: `#${formId}`,
          formData: formData,
          timestamp: Date.now(),
          formHtml: $form.prop('outerHTML'),
        };
  
        console.log('🔵 Storing PayPal data with key: paypal_form_data');
        sessionStorage.setItem('paypal_form_data', JSON.stringify(storedData));
  
        // Use current URL for both return and cancel
        const currentUrl = window.location.href.split('?')[0];
        const returnUrl = currentUrl;
        const cancelUrl = currentUrl;
  
        console.log('🔵 Using current URL for both return and cancel:', currentUrl);
  
        try {
          console.log('🔵 Getting JWT token...');
          state.jwtToken = await api.getJWTToken();
          console.log('🔵 JWT token received:', state.jwtToken ? 'YES' : 'NO');
  
          console.log('🔵 Creating PayPal payload...');
          const payload = paymentProcessors.createPayPalPayload($form, formData.donationAmount);
          console.log('🔵 PayPal payload created:', payload);
  
          console.log('🔵 Initializing PayPal...');
          const response = await api.initializePayPal(payload, returnUrl, cancelUrl);
          console.log('🔵 PayPal initialization response:', response);
  
          if (response?.PayPalUrl || response?.payPalUrl) {
            const paypalUrl = response.PayPalUrl || response.payPalUrl;
            console.log('🔵 Redirecting to PayPal URL:', paypalUrl);
            window.location.href = paypalUrl;
          } else {
            console.error('🔴 Invalid PayPal response - missing URL:', response);
            throw new Error('Invalid PayPal response: Missing PayPal URL');
          }
        } catch (error) {
          console.error('🔴 PayPal initialization error:', error);
          ui.showError($form, 'Failed to initialize PayPal payment. Please try again.');
          paymentProcessors.handleError(error, $form);
        }
      },
  
      createPayPalPayload($form, donationAmount) {
        console.log('🔵 createPayPalPayload called', { donationAmount });
        const formData = formHelpers.getFormData($form);
        const donationType = formHelpers.getDonationType(formData);
  
        const payload = [
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
  
        console.log('🔵 PayPal payload created:', payload);
        return payload;
      },
  
      async handlePayPalReturn() {
        console.log('🔵 handlePayPalReturn called');
        console.log('🔵 Full URL:', window.location.href);
        console.log('🔵 Location search:', location.search);
        console.log('🔵 Location hash:', location.hash);
  
        // Check if we have PayPal parameters
        const payPalToken = utils.getUrlParameter('token');
        const payPalPayerId = utils.getUrlParameter('PayerID');
  
        console.log('🔵 PayPal return analysis:', {
          payPalToken: payPalToken ? 'YES' : 'NO',
          payPalPayerId: payPalPayerId ? 'YES' : 'NO',
        });
  
        // If no token at all, this isn't a PayPal return
        if (!payPalToken) {
          console.log('🔵 No PayPal token found, not a PayPal return');
          return false;
        }
  
        // If we have token but no PayerID, it's a cancel
        if (payPalToken && !payPalPayerId) {
          console.log('🔵 PayPal payment was cancelled (token but no PayerID)');
          sessionStorage.removeItem('paypal_form_data');
  
          // Clear URL parameters
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.delete('token');
          currentUrl.searchParams.delete('PayerID');
          window.history.replaceState({}, document.title, currentUrl.toString());
  
          return false;
        }
  
        // If we have both token and PayerID, it's a success
        if (payPalToken && payPalPayerId) {
          console.log('🔵 PayPal payment successful (token and PayerID present)');
  
          console.log('🔵 Looking for stored PayPal data with key: paypal_form_data');
          const storedDataStr = sessionStorage.getItem('paypal_form_data');
          if (!storedDataStr) {
            console.error('🔴 No stored PayPal data found');
            console.log('🔵 Available sessionStorage keys:', Object.keys(sessionStorage));
            return false;
          }
  
          console.log('🔵 Found stored data, parsing...');
          try {
            const storedData = JSON.parse(storedDataStr);
            console.log('🔵 Parsed stored data:', storedData);
  
            console.log('🔵 Looking for form with selector:', storedData.formSelector);
            const $form = paymentProcessors.findPayPalForm(storedData);
            console.log('🔵 Form found:', { found: $form && $form.length, formId: $form?.attr('id') });
  
            if (!$form || !$form.length) {
              console.error('🔴 Could not find donation form');
              throw new Error('Could not find donation form');
            }
  
            console.log('🔵 Showing donate form...');
            ui.showDonateForm($form);
            ui.hideDonationFormAndShowSuccess(storedData.formData.frequency);
  
            state.currentForm = $form;
            console.log('🔵 Set current form:', state.currentForm.length);
  
            console.log('🔵 Toggling processing state...');
            ui.toggleProcessing(true);
            $form.find('[data-donate="complete-button"]').prop('disabled', true);
            $form.find('[data-donate="complete-button"] .btn_main_text').text('Processing...');
  
            console.log('🔵 Getting JWT token...');
            state.jwtToken = await api.getJWTToken();
            console.log('🔵 JWT token received:', state.jwtToken ? 'YES' : 'NO');
  
            const formData = storedData.formData; // Use the stored form data directly
            console.log('🔵 Using stored form data:', formData);
  
            const donationType = formHelpers.getDonationType(formData);
            console.log('🔵 Donation type:', donationType);
  
            const paypalData = {
              payPalToken: payPalToken,
              payPalPayerId: payPalPayerId,
              payPalTotalAmount: parseFloat(formData.donationAmount),
              payPalCurrency: 'CAD',
              paymentMethod: 1,
            };
  
            console.log('🔵 PayPal data prepared:', paypalData);
  
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
  
            console.log('🔵 Donation data prepared:', donationData);
            console.log('🔵 Submitting donation...');
  
            const response = await api.submitDonation(donationData);
            console.log('🔵 Donation submission response:', response);
  
            console.log('🔵 Removing stored PayPal data...');
            sessionStorage.removeItem('paypal_form_data');
  
            // Clear URL parameters after successful processing
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.delete('token');
            currentUrl.searchParams.delete('PayerID');
  
            console.log('🔵 Clearing URL parameters, new URL:', currentUrl.toString());
  
            // Update browser history without the PayPal parameters
            window.history.replaceState({}, document.title, currentUrl.toString());
  
            console.log('🔵 Handling donation response...');
            return paymentProcessors.handleDonationResponse(response, formData.frequency);
          } catch (error) {
            console.error('🔴 PayPal return processing error:', error);
            const $form = state.currentForm;
            if ($form) {
              console.log('🔵 Showing error on form...');
              ui.showError($form, 'There was an error processing your PayPal payment. Please try again or contact support.');
            }
            paymentProcessors.handleError(error, $form);
            return false;
          }
        }
  
        console.log('🔵 Unexpected PayPal return state');
        return false;
      },
  
      findPayPalForm(storedData) {
        console.log('🔵 findPayPalForm called with:', storedData);
  
        // Try multiple methods to find the form
        let $form = $(storedData.formSelector);
        console.log('🔵 Trying stored selector:', storedData.formSelector, 'Result:', $form.length);
  
        if (!$form.length) {
          console.log('🔵 Stored selector failed, trying to find any donation form...');
          $form = $('form')
            .filter(function () {
              const hasButton = $(this).find('[data-donate="complete-button"]').length > 0;
              console.log('🔵 Checking form:', $(this).attr('id'), 'has button:', hasButton);
              return hasButton;
            })
            .first();
          console.log('🔵 Found form via filter:', $form.length, 'ID:', $form.attr('id'));
        }
  
        return $form;
      },
  
      handleDonationResponse(response, frequency) {
        console.log('🔵 handleDonationResponse called', { response, frequency });
  
        let parsedResponse = response;
        if (typeof response === 'string') {
          console.log('🔵 Response is string, parsing...');
          try {
            parsedResponse = JSON.parse(response);
            console.log('🔵 Parsed response:', parsedResponse);
          } catch (e) {
            console.error('🔴 Failed to parse response:', e);
            throw new Error('Invalid response format');
          }
        }
  
        if (parsedResponse.Success === true) {
          console.log('🔵 Donation successful!');
          const txCode = parsedResponse.Result.Transaction.TxCode;
          console.log('🔵 Transaction code:', txCode);
  
          $('[data-donate="transaction-number"]').text(txCode);
          console.log('🔵 Set transaction number in UI');
  
          console.log('🔵 Showing success screen for frequency:', frequency);
          ui.showSuccessScreen(frequency);
          ui.toggleProcessing(false);
          return parsedResponse;
        } else {
          console.error('🔴 Donation failed:', parsedResponse);
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
        console.error('🔴 Payment error:', error);
  
        if (typeof Sentry !== 'undefined') {
          Sentry.captureException(error);
        }
  
        // Log to Zapier
        paymentProcessors.logErrorToZapier(error);
      },
  
      logErrorToZapier(error) {
        console.log('🔵 Logging error to Zapier...');
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
  
          console.log('🔵 Credit card donation data prepared:', donationData);
  
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
        console.log('🔵 eventHandlers.init called');
  
        // Tribute checkboxes
        $('[data-donate="dedicate-this-donation"] input[type=checkbox]').on('change', function () {
          console.log('🔵 Honour checkbox changed');
          if ($(this).is(':checked')) {
            ui.updateEcardDesigns('honour');
          }
        });
  
        $('[data-donate="dedicate-in-memory"] input[type=checkbox]').on('change', function () {
          console.log('🔵 Memory checkbox changed');
          if ($(this).is(':checked')) {
            ui.updateEcardDesigns('memory');
          }
        });
  
        // Payment method selection
        $(document).on('change', '[data-donate="payment-method"] input[type="radio"]', function () {
          const paymentMethod = $(this).val();
          console.log('🔵 Payment method changed:', paymentMethod);
          $('[data-donate="credit-card-fields"]').toggle(paymentMethod === 'credit-card');
          $('[data-donate="paypal-fields"]').toggle(paymentMethod === 'paypal');
        });
  
        // PayPal button
        $(document).on('click', '[data-donate="paypal-button"]', function (e) {
          console.log('🔵 PayPal button clicked');
          e.preventDefault();
          if (state.isProcessing) {
            console.log('🔵 Already processing, ignoring click');
            return;
          }
  
          const $form = $(this).closest('form');
          console.log('🔵 PayPal form found:', { formId: $form.attr('id'), formLength: $form.length });
  
          $(this).css('opacity', '0.5');
          $(this).prop('disabled', true);
          state.currentForm = $form;
          paymentProcessors.processPayPal($form);
        });
  
        // Credit card submit button
        $(document).on('click', '[data-donate="complete-button"]', function (e) {
          console.log('🔵 Complete button clicked');
          e.preventDefault();
          if (state.isProcessing) {
            console.log('🔵 Already processing, ignoring click');
            return;
          }
  
          const $form = $(this).closest('form');
          console.log('🔵 Credit card form found:', { formId: $form.attr('id'), formLength: $form.length });
  
          $(this).prop('disabled', true);
          ui.toggleProcessing(true);
          $form.find('[data-donate="complete-button"] .btn_main_text').text('Processing...');
          state.currentForm = $form;
          monerisHandler.initiate();
        });
  
        // Moneris message handler
        if (window.addEventListener) {
          window.addEventListener('message', monerisHandler.handleResponse, false);
          console.log('🔵 Moneris message handler added');
        } else if (window.attachEvent) {
          window.attachEvent('onmessage', monerisHandler.handleResponse);
          console.log('🔵 Moneris message handler added (legacy)');
        }
  
        console.log('🔵 Event handlers initialized');
      },
    };
  
    /**
     * Initialization
     */
    const init = async () => {
      console.log('🔵 init function called');
  
      // Set up UTM source mapping
      const utmSource = utils.getUrlParameter('utm_source');
      console.log('🔵 UTM source:', utmSource);
  
      if (utmSource && CONFIG.utmSourceMapping[utmSource]) {
        state.subEventCustomPart = CONFIG.utmSourceMapping[utmSource];
        console.log('🔵 Set subEventCustomPart to:', state.subEventCustomPart);
      }
  
      // Check language
      const utmId = utils.getUrlParameter('utm_id');
      console.log('🔵 UTM ID:', utmId);
  
      if (utmId === 'fr' || $('html').attr('lang') === 'fr') {
        state.isFrench = true;
        state.subEventCustomPart += 'FR';
        console.log('🔵 French language detected, updated subEventCustomPart to:', state.subEventCustomPart);
      }
  
      // Check if returning from PayPal
      console.log('🔵 Checking for PayPal return...');
      const isPayPalReturn = await paymentProcessors.handlePayPalReturn();
      console.log('🔵 PayPal return result:', isPayPalReturn);
  
      // Only initialize event handlers if not processing PayPal return
      //    //ToDo: may need this even if it's a paypal return
      if (!isPayPalReturn) {
        console.log('🔵 Initializing event handlers...');
        eventHandlers.init();
      } else {
        console.log('🔵 Skipping event handler initialization due to PayPal return');
      }
  
      console.log('🔵 Initialization complete');
    };
  
    // Start the application
    init();
  });
  