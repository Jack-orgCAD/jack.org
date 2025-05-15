$(document).ready(function() {
  // Check if any donation form exists on the page
  if ($("[data-donate='complete-button']").length > 0) {

    const AUTHENTICATION_URL = 'https://security.dm.akaraisin.com/api/authentication';
    const MONERIS_TOKEN_URL = 'https://www3.moneris.com/HPPtoken/index.php';
    const CONSTITUENT_API_URL = 'https://api.akaraisin.com/v2/constituent';
    const PAYPAL_INIT_URL = 'https://api.akaraisin.com/v2/payment/paypal';
    const FALLBACK_DONATION_URL = 'https://jack.akaraisin.com/ui/donatenow';

    let jwtToken = '';
    let moneris_dataKey = '';
    let moneris_bin = '';
    let isProcessing = false;
    let isFrench = false;

    let organizationId = 196;
    let subEventCustomPart = "YE25W"; // Default value

    // Function to get URL parameters
    function getUrlParameter(name) {
      name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
      var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
      var results = regex.exec(location.search);
      return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
    }

    // Set subEventCustomPart based on utm_source
    const utmSource = getUrlParameter('utm_source');
    const utmSourceMapping = {
      '34705': 'YE25BRE',
      '34694': 'YE25W',
      '34700': 'YE25A',
      '34703': 'YE25DM',
      '34695': 'YE25M1',
      '34696': 'YE25M2',
      '34697': 'YE25M3',
      '34698': 'YE25M4',
      '34769' : 'Fall25A'
    };

    if (utmSource && utmSourceMapping[utmSource]) {
      subEventCustomPart = utmSourceMapping[utmSource];
    }

    // Check if utm_id=fr is in the URL
    const utmId = getUrlParameter('utm_id');
    if (utmId === 'fr' || $('html').attr('lang') === 'fr') {
      isFrench = true;
      subEventCustomPart += 'FR';
    }

    // Handle "In Honour" checkbox
    $('[data-donate="dedicate-this-donation"] input[type=checkbox]').on('change', function() {
        if ($(this).is(":checked")) {
            updateEcardDesigns('honour');
        }
    });

    // Handle "In Memory" checkbox
    $('[data-donate="dedicate-in-memory"] input[type=checkbox]').on('change', function() {
        if ($(this).is(":checked")) {
            updateEcardDesigns('memory');
        }
    });

    // Function to get JWT token
    function getJWTToken() {
      return $.ajax({
        url: AUTHENTICATION_URL,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          organizationId: organizationId,
          subEventCustomPart: subEventCustomPart
        })
      }).then(function(response) {
        return response;
      }).catch(function(error) {
        throw error;
      });
    }

    // Check if we're returning from PayPal
    function checkPayPalReturn() {
      const payPalToken = getUrlParameter('token');
      const payPalPayerId = getUrlParameter('PayerID');
      const transactionId = getUrlParameter('txid');
      
      if (payPalToken && payPalPayerId && transactionId) {
        const formData = JSON.parse(localStorage.getItem('paypal_' + transactionId));
        // Continue processing...
      }
    }

    // Check for PayPal return on page load
    if (checkPayPalReturn()) {
      // Already handling PayPal return, don't proceed with normal form init
      return;
    }

    function doCCSubmit() {
      var ccFrameRef = document.getElementById("monerisFrame").contentWindow;
      ccFrameRef.postMessage("tokenize", MONERIS_TOKEN_URL);
      return false;
    }

    function initiatePayPalPayment($form) {
      // Save form data to sessionStorage for retrieval after PayPal redirect
      const formSelector = `form[data-donate-form="${$form.attr('data-donate-form')}"]`;
      const formData = getFormData($form);
      formData.formSelector = formSelector;
      
      sessionStorage.setItem('donationFormData', JSON.stringify(formData));
      
      // Generate return and cancel URLs
      const currentUrl = window.location.href.split('?')[0]; // Remove any existing query params
      const transactionId = Date.now() + "-" + Math.random().toString(36).substring(2, 15);
      const returnUrl = currentUrl + "?txid=" + transactionId;
      const cancelUrl = currentUrl;
      
      // Get donation amount
      let donationAmount;
      const selectedAmount = $form.find('[data-donate="amount"] input:checked').val().trim();
      if (selectedAmount === 'Other') {
        donationAmount = $form.find('[data-donate="other-amount"]').val().trim().replace('$', '');
      } else {
        donationAmount = selectedAmount.replace('$', '');
      }
      
      // Create payload for PayPal initialization
      const payloadData = createPayPalPayload($form, donationAmount, returnUrl, cancelUrl);
      
      // Get JWT token and then make PayPal initialization request
      getJWTToken()
        .then(function(response) {
          jwtToken = response;
          
          return $.ajax({
            url: PAYPAL_INIT_URL + `?returnUrl=${encodeURIComponent(returnUrl)}&cancelUrl=${encodeURIComponent(cancelUrl)}`,
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + jwtToken,
              'Content-Type': 'application/json'
            },
            data: JSON.stringify(payloadData)
          });
        })
        .then(function(response) {
          if (response && response.payPalUrl) {
            // Redirect to PayPal
            window.location.href = response.payPalUrl;
          } else {
            throw new Error('Invalid PayPal response');
          }
        })
        .catch(function(error) {
          $form.find("#cc-error").text("Failed to initialize PayPal payment. Please try again.").show();
          $form.find('[data-donate="complete-button"]').prop('disabled', false);
          $form.find('[data-donate="complete-button"] .btn_main_text').text('Donate');
          toggleProcessing(false);
        });
    }

    // Helper function to create PayPal payload
    function createPayPalPayload($form, donationAmount, returnUrl, cancelUrl) {
      const formData = getFormData($form);
      const frequency = $form.find('[data-donate="frequency"] input:checked').val().toLowerCase().trim();
      const isDedicatedDonation = formData.inHonour || formData.inMemory;
      
      const donationType = (() => {
        if (isDedicatedDonation) {
          switch (frequency) {
            case 'one-time': return formData.inMemory ? 3 : 2;   // In Memory or In Honour Donation
            case 'monthly': return formData.inMemory ? 12 : 7;   // In Memory or In Honour Monthly
            case 'quarterly': return formData.inMemory ? 21 : 9; // In Memory or In Honour Quarterly
            case 'annual': return formData.inMemory ? 22 : 10;   // In Memory or In Honour Annual
            default: return formData.inMemory ? 3 : 2;           // Default to One-time
          }
        } else {
          switch (frequency) {
            case 'one-time': return 1;   // General Donation
            case 'monthly': return 4;     // General Monthly
            case 'quarterly': return 5;   // General Quarterly
            case 'annual': return 6;      // General Annual
            default: return 1;            // Default to General Donation
          }
        }
      })();
      
      return {
        profile: {
          userId: 0,
          contactType: formData.isDonatingOnBehalfOfCompany ? 1 : 0,
          constituentType: 0,
          title: null,
          firstName: formData.firstName,
          middleName: null,
          lastName: formData.lastName,
          emailType: null,
          email: formData.email,
          username: null,
          password: null,
          confirmPassword: null,
          organization: formData.isDonatingOnBehalfOfCompany ? formData.organization : null,
          phoneType: null,
          phone: formData.phone || "",
          phoneExtension: null,
          goal: null,
          dateOfBirth: null,
          gender: null,
          interfaceLanguage: isFrench ? 2 : 1,
          correspondanceLanguage: isFrench ? 2 : 1,
          customField1: null,
          customField2: null,
          customField3: null,
          customField4: null,
          customField5: null,
          lastModified: "0001-01-01T00:00:00",
          subEventUserLastModified: "0001-01-01T00:00:00",
          address: {
            addressType: null,
            line1: formData.address,
            line2: formData.address2 || null,
            city: formData.city,
            regionId: parseInt(formData.regionId, 10),
            region: null,
            postalCode: formData.postCode,
            countryId: parseInt(formData.countryId, 10),
            country: null
          },
          receiveCommunications: !formData.optOutOfCommunications,
          allowDistributionOfDetails: formData.isAnonymousDonation,
          privacy: false,
          personalDataUseExplicitConsent: null,
          accountInfo: null
        },
        paymentDetails: {
          cardNumber: null,
          cardHolderName: "",
          cardExpiration: null,
          cardType: 0,
          billingProfile: null,
          cardExpirationDate: null,
          cardTypeTitle: null,
          creditCardNumberMasked: null,
          cvv: null,
          isVisaCheckOutAllowed: false,
          payPalCurrency: null,
          payPalPayerId: null,
          payPalToken: null,
          payPalTotalAmount: 0,
          paymentMethod: 1, // PayPal
          reCaptchaError: null,
          transactionAttribute: null
        },
        purchaseItems: [
          {
            promoCode: null,
            itemId: 0,
            typeLabel: "Donation",
            category: "Donation",
            category2: "",
            category3: "",
            registrationFee: 0,
            minFundRaisingGoal: 0,
            suggestedFundRaisingGoal: 0,
            name: "",
            type: donationType,
            $type: "GeneralDonationItem",
            quantity: 0,
            donationAmount: parseFloat(donationAmount),
            isSelfDonation: false,
            eventTypeId: 11,
            subEventGroupId: null,
            sponsoredEntityType: 1,
            sponsoredEntityId: null, // Would need to be set if required
            sponsoredEntityName: null // Would need to be set if required
          }
        ],
        surveys: [],
        returningUserId: null,
        importSubEventId: null,
        failedTransactionUserId: null,
        authorizedRole: null,
        subEventGroupId: null,
        isAskedToCoverAdminFee: true
      };
    }

    // Helper function to collect form data
    function getFormData($form) {
      const formFields = {
        firstName: $form.find('[data-donate="first-name"]').val(),
        lastName: $form.find('[data-donate="last-name"]').val(),
        email: $form.find('[data-donate="email"]').val(),
        phone: $form.find('[data-donate="phone"]').val(),
        countryId: $form.find('[data-donate="country"]').val(),
        address: $form.find('[data-donate="address"]').val(),
        address2: $form.find('[data-donate="address-2"]').val(),
        city: $form.find('[data-donate="city"]').val(),
        regionId: $form.find('[data-donate="region"]').val(),
        postCode: $form.find('[data-donate="post-code"]').val(),
        organization: $form.find('[data-donate="company-name"]').val(),
        cardholderName: $form.find('[data-donate="cardholder-name"]').val(),
        tributeeFirstName: $form.find('[data-donate="tributee-first-name"]').val(),
        tributeeLastName: $form.find('[data-donate="tributee-last-name"]').val(),
        inHonour: $form.find('[data-donate="dedicate-this-donation"] input[type=checkbox]').is(":checked"),
        inMemory: $form.find('[data-donate="dedicate-in-memory"] input[type=checkbox]').is(":checked"),
        isDonatingOnBehalfOfCompany: $form.find('[data-donate="donate-company"] input[type=checkbox]').is(":checked"),
        isAdminFee: $form.find('[data-donate="admin-cost"] input[type=checkbox]').is(":checked"),
        optOutOfCommunications: $form.find('[data-donate="opt-out"] input[type=checkbox]').is(":checked"),
        isAnonymousDonation: $form.find('[data-donate="donate-anonymously"] input[type=checkbox]').is(":checked"),
        frequency: $form.find('[data-donate="frequency"] input:checked').val().toLowerCase().trim()
      };

      // Trim all string values
      Object.keys(formFields).forEach(key => {
        if (typeof formFields[key] === 'string') {
          formFields[key] = formFields[key].trim();
        }
      });

      return formFields;
    }

    var respMsg = function (e) {
      if (e.origin.includes('moneris.com')) {
        var respData = JSON.parse(e.data);
        var responseCode = Array.isArray(respData.responseCode) ? respData.responseCode[0] : respData.responseCode;
        var message = "";
        switch (responseCode) {
          case "001": // 001
            window.currentDonationForm.find("#data-key").val(respData.dataKey);
            moneris_dataKey = respData.dataKey;
            moneris_bin = respData.bin;
            getJWTToken()
              .then(function(response) {
                jwtToken = response;
                return formatAndSubmitDonation(window.currentDonationForm, moneris_dataKey, moneris_bin);
              })
              .then(function(donationResponse) {
                window.currentDonationForm.submit();
                return true;
              })
              .catch(function(error) {
                let errorMessage = "We're experiencing technical difficulties. Please try to donate at: " + FALLBACK_DONATION_URL;
                
                if (error && error.Exception && error.Exception.Message === "Payment declined.") {
                  errorMessage = "Your payment was declined. Please check your card details and try again, or use a different payment method.";
                }
                // Fire Sentry for error tracking
                Sentry.captureMessage('User failed to submit donation', 'error');

                // Get the IP and location info
                fetch('https://ipapi.co/json/')
                    .then(res => res.json())
                    .then(ipData => {
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
                        body: formData
                      }).catch( Sentry.captureMessage('Capture user data failed', 'error'));
                    })
                    .catch( Sentry.captureMessage('User failed to submit donation', 'error'));

                
                window.currentDonationForm.find("#cc-error").text(errorMessage).show();
                window.currentDonationForm.find('[data-donate="complete-button"]').prop('disabled', false);
                window.currentDonationForm.find('[data-donate="complete-button"] .btn_main_text').text('Donate');
                toggleProcessing(false);
              });
            return false;
          case "943":
            message = "Card data is invalid.";
            break;
          case "944":
            message = "Invalid expiration date (MMYY, must be a future date).";
            break;
          case "945":
            message = "Invalid CVD data (not 3-4 digits).";
            break;
          default:
            message = "Error saving credit card, please contact us donate@jack.org";
            window.currentDonationForm.find('[data-donate="complete-button"]').prop('disabled', false);
            window.currentDonationForm.find('[data-donate="complete-button"] .btn_main_text').text('Donate');
            toggleProcessing(false);
        }
        window.currentDonationForm.find("#cc-error").text(message);
        window.currentDonationForm.find('[data-donate="complete-button"]').prop('disabled', false);
        window.currentDonationForm.find('[data-donate="complete-button"] .btn_main_text').text('Donate');
        toggleProcessing(false);
        return false;
      }
    };

    function getCardType(bin) {
      const binStr = bin.toString();
      // Check MasterCard (51-55)
      if (/^5[1-5]/.test(binStr)) return 1;
      // Check VISA (4)
      if (/^4/.test(binStr)) return 2;
      // Check AMEX (34, 37)
      if (/^3[47]/.test(binStr)) return 3;
      // Check Diners Club (36, 38)
      if (/^3[68]/.test(binStr)) return 4;
      // Check Discover (6011, 65)
      if (/^6011|^65/.test(binStr)) return 5;
      // Default to None (0)
      return 0;
    }

    function formatAndSubmitDonation($form, moneris_dataKey, moneris_bin, paypalData) {
      const frequency = $form.find('[data-donate="frequency"] input:checked').val().toLowerCase().trim();
      const inHonour = $form.find('[data-donate="dedicate-this-donation"] input[type=checkbox]').is(":checked");
      const inMemory = $form.find('[data-donate="dedicate-in-memory"] input[type=checkbox]').is(":checked");
      const isDedicatedDonation = inHonour || inMemory;
      const isDonatingOnBehalfOfCompany = $form.find('[data-donate="donate-company"] input[type=checkbox]').is(":checked");
      const isAdminFee = $form.find('[data-donate="admin-cost"] input[type=checkbox]').is(":checked");
      const optOutOfCommunications = $form.find('[data-donate="opt-out"] input[type=checkbox]').is(":checked");
      const isAnonymousDonation = $form.find('[data-donate="donate-anonymously"] input[type=checkbox]').is(":checked");
      const donationType = (() => {
        if (isDedicatedDonation) {
          switch (frequency) {
            case 'one-time': return inMemory ? 3 : 2;   // In Memory or In Honour Donation
            case 'monthly': return inMemory ? 12 : 7;   // In Memory or In Honour Monthly
            case 'quarterly': return inMemory ? 21 : 9; // In Memory or In Honour Quarterly
            case 'annual': return inMemory ? 22 : 10;   // In Memory or In Honour Annual
            default: return inMemory ? 3 : 2;           // Default to One-time
          }
        } else {
          switch (frequency) {
            case 'one-time': return 1;   // General Donation
            case 'monthly': return 4;     // General Monthly
            case 'quarterly': return 5;   // General Quarterly
            case 'annual': return 6;      // General Annual
            default: return 1;            // Default to General Donation
          }
        }
      })();
      
      const formFields = {
        firstName: $form.find('[data-donate="first-name"]').val(),
        lastName: $form.find('[data-donate="last-name"]').val(),
        email: $form.find('[data-donate="email"]').val(),
        phone: $form.find('[data-donate="phone"]').val(),
        countryId: $form.find('[data-donate="country"]').val(),
        address: $form.find('[data-donate="address"]').val(),
        address2: $form.find('[data-donate="address-2"]').val(),
        city: $form.find('[data-donate="city"]').val(),
        regionId: $form.find('[data-donate="region"]').val(),
        postCode: $form.find('[data-donate="post-code"]').val(),
        organization: $form.find('[data-donate="company-name"]').val(),
        cardholderName: $form.find('[data-donate="cardholder-name"]').val(),
        tributeeFirstName: $form.find('[data-donate="tributee-first-name"]').val(),
        tributeeLastName: $form.find('[data-donate="tributee-last-name"]').val()
      };

      // Trim all values
      Object.keys(formFields).forEach(key => {
        if (typeof formFields[key] === 'string') {
          formFields[key] = formFields[key].trim();
        }
      });

      let donationAmount;
      
      const selectedAmount = $form.find('[data-donate="amount"] input:checked').val().trim();
      if (selectedAmount === 'Other') {
        donationAmount = $form.find('[data-donate="other-amount"]').val().trim().replace('$', '');
      } else {
        donationAmount = selectedAmount.replace('$', '');
      }

      // Determine payment method (0 for credit card, 1 for PayPal)
      const paymentMethod = paypalData ? 1 : 0;

      const jsonData = {
        profile: {
          address: {
            line1: formFields.address,
            line2: formFields.address2,
            city: formFields.city,
            regionId: parseInt(formFields.regionId, 10),
            postalCode: formFields.postCode,
            countryId: parseInt(formFields.countryId, 10)
          },
          userId: 0, // Always send userId as '0'
          contactType: isDonatingOnBehalfOfCompany ? 1 : 0, // 0 for individual, 1 for company representative
          title: "",
          firstName: formFields.firstName,
          lastName: formFields.lastName,
          email: formFields.email,
          organization: isDonatingOnBehalfOfCompany ? formFields.organization : "", // Fill with organization name if donating as company representative
          phone: formFields.phone,
          gender: "",
          interfaceLanguage: isFrench ? 2 : 1, 
          correspondanceLanguage: isFrench ? 2 : 1, 
          receiveCommunications: !optOutOfCommunications,
          allowDistributionOfDetails: isAnonymousDonation,
          isCharityOrg: isDonatingOnBehalfOfCompany
        },
        paymentDetails: {
          paymentMethod: paymentMethod,
          cardHolderName: paymentMethod === 0 ? formFields.cardholderName : "",
          cardType: paymentMethod === 0 ? getCardType(moneris_bin) : 0,
          paymentToken: paymentMethod === 0 ? moneris_dataKey : "",
          cardNumber: paymentMethod === 0 ? moneris_bin : "",
          payPalToken: paymentMethod === 1 ? (paypalData ? paypalData.payPalToken : "") : "",
          payPalPayerId: paymentMethod === 1 ? (paypalData ? paypalData.payPalPayerId : "") : "",
          payPalTotalAmount: paymentMethod === 1 ? parseFloat(donationAmount) : 0,
          payPalCurrency: paymentMethod === 1 ? "CAD" : "",
          isVisaCheckOutAllowed: false,
          reCaptchaError: ""
        },
        purchaseItems: [
          {
            promoCode: null,
            itemId: 0,
            typeLabel: "Donation",
            category: "Donation",
            category2: "",
            category3: "",
            registrationFee: 0,
            minFundRaisingGoal: 0,
            suggestedFundRaisingGoal: 0,
            name: "",
            type: donationType,
            quantity: 1,
            donationAmount: parseFloat(donationAmount),
            fundId: 10444,
            otherFundName: "",
            tribute: null, 
            eventTypeId: 11,
            $type: "GeneralDonationItem",
            isSelfDonation: false
          }
        ],
        surveys: [],
        returningUserId: null,
        importSubEventId: null
      };

      // Add admin fee item if applicable
      let adminFeeAmount = 0;
      if (isAdminFee) {
        adminFeeAmount = parseFloat(donationAmount) * 0.02;
        adminFeeAmount = Math.min(adminFeeAmount, 5.00);
        adminFeeAmount = Math.round(adminFeeAmount * 100) / 100;
      }
      if (isAdminFee && adminFeeAmount > 0) {
        jsonData.purchaseItems.push({
          promoCode: null,
          itemId: 0,
          typeLabel: "AdminFee",
          category: "Admin Fee",
          category2: "",
          category3: "",
          registrationFee: 0,
          minFundRaisingGoal: 0,
          suggestedFundRaisingGoal: 0,
          name: "",
          adminFeeAmount: adminFeeAmount,
          type: 29,
          $type: "AdminFeeItem"
        });
      }

      // Handle dedicated donation
      if (isDedicatedDonation) {
          if (formFields.tributeeFirstName && formFields.tributeeFirstName.trim()) {
              const tributeObject = {
                  firstName: formFields.tributeeFirstName,
                  lastName: formFields.tributeeLastName || ""
              };

              // Check if ecard is selected by checking if value is 'e-card'
              if ($form.find('[data-donate="ecard-selection"] input:checked').val() === 'e-card') {
                  // Get the selected ecard design value
                  let selectedTemplateId = parseInt($form.find('[data-donate="ecard-design"] input:checked').val(), 10);
                  if (isNaN(selectedTemplateId)) {
                      selectedTemplateId = parseInt($form.find('[data-donate="ecard-design"] input:visible:first').val(), 10);
                  }
                  
                  tributeObject.eCard = {
                      templateId: selectedTemplateId,
                      message: $form.find('[data-donate="message"]').val().trim(), 
                      deliveryDate: $form.find('[data-donate="date"]').val().trim(),
                      recipients: $form.find('[data-donate="add"]').map(function() {
                          const $recipientBlock = $(this);
                          const email = $recipientBlock.find('[data-donate="recipient-email"]').val().trim();
                          const firstName = $recipientBlock.find('[data-donate="recipient-first-name"]').val().trim();
                          const lastName = $recipientBlock.find('[data-donate="recipient-last-name"]').val().trim();
                          
                          // Only include recipients that have at least an email address
                          if (email && firstName) {
                              return {
                                  firstName: firstName,
                                  lastName: lastName || "",
                                  email: email
                              };
                          }
                      }).get() // Convert jQuery object to array and filter out undefined values
                  };
              }

              jsonData.purchaseItems[0].tribute = tributeObject;
          }
      }

      //console.log("JSON data to be submitted:", jsonData);
      return $.ajax({
        url: CONSTITUENT_API_URL,
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + jwtToken,
          'Content-Type': 'application/json'
        },
        data: JSON.stringify(jsonData)
      }).then(function(response) {
        let parsedResponse = response;
        if (typeof response === 'string') {
          try {
            parsedResponse = JSON.parse(response);
          } catch (e) {
            throw new Error("Invalid response format");
          }
        }
        
        if (parsedResponse.Success === true) {
          const txCode = parsedResponse.Result.Transaction.TxCode;
          $('[data-donate="transaction-number"]').text(txCode);
          
          if (frequency === 'one-time') {
            $('[data-donate="success-otg"]').show();
            $('[data-donate="success-monthly"]').hide();
          } else if (frequency === 'monthly') {
            $('[data-donate="success-monthly"]').show();
            $('[data-donate="success-otg"]').hide();
          }
          
          $("body").removeClass("form-submitting");
          return parsedResponse;
        } else {
          // Log error to Sentry with transaction details
          if (typeof Sentry !== 'undefined') {
            Sentry.withScope(function(scope) {
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
              
              Sentry.captureMessage(
                parsedResponse.exception?.code === 4020 
                  ? 'Payment declined by payment processor'
                  : 'Donation API returned failure response'
              );
            });
          }
          throw new Error('Donation failed: ' + JSON.stringify(parsedResponse));
        }
      }).catch(function(error) {
        throw error;
      });
    }

    function toggleProcessing(state) {
      isProcessing = state;
      if (state) {
        $("body").addClass("form-submitting");
      } else {
        $("body").removeClass("form-submitting");
      }
    }

    function updateEcardDesigns(tributeType) {
        const cardMappings = {
            'honour': {
                'english': ['3320', '2331', '2332'],
                'french': ['3326']
            },
            'memory': {
                'english': ['3324', '2333'],
                'french': ['3328']
            }
        };

        let relevantCardIds = [];
        if (tributeType === 'honour') {
            relevantCardIds = isFrench ? cardMappings.honour.french : cardMappings.honour.english;
        } else if (tributeType === 'memory') {
            relevantCardIds = isFrench ? cardMappings.memory.french : cardMappings.memory.english;
        }

        $('[data-donate="ecard-design"]').hide();
        
        relevantCardIds.forEach(id => {
            $(`[data-donate="ecard-design"] input[value="${id}"]`).closest('[data-donate="ecard-design"]').show();
        });

        const visibleCards = $('[data-donate="ecard-design"]:visible');
        const selectedCard = $('[data-donate="ecard-design"] input:checked:visible');
        if (visibleCards.length > 0 && selectedCard.length === 0) {
            visibleCards.first().find('input[type="radio"]').prop('checked', true);
        }
    }

    // Add event listener for payment method selection
    $(document).on("change", '[data-donate="payment-method"] input[type="radio"]', function() {
      const paymentMethod = $(this).val();
      
      if (paymentMethod === "credit-card") {
        $('[data-donate="credit-card-fields"]').show();
        $('[data-donate="paypal-fields"]').hide();
      } else if (paymentMethod === "paypal") {
        $('[data-donate="credit-card-fields"]').hide();
        $('[data-donate="paypal-fields"]').show();
      }
    });

    $(document).on("click", '[data-donate="complete-button"]', function (e) {
      e.preventDefault();
      
      if (isProcessing) {
        return;
      }
      
      const $form = $(this).closest('form');
      
      $(this).prop('disabled', true);
      toggleProcessing(true);
      $form.find('[data-donate="complete-button"] .btn_main_text').text('Processing...');
      
      window.currentDonationForm = $form;
      
      // Determine which payment method is selected
      const paymentMethod = $form.find('[data-donate="payment-method"] input[type="radio"]:checked').val();
      
      if (paymentMethod === "paypal") {
        // Handle PayPal payment
        initiatePayPalPayment($form);
      } else {
        // Default to credit card payment
        doCCSubmit();
      }
    });

    if (window.addEventListener) {
      window.addEventListener("message", respMsg, false);
    } else if (window.attachEvent) {
      window.attachEvent("onmessage", respMsg);
    }
  }
  
});
