(function(define) {
    'use strict';
    define([
        'jquery',
        'underscore',
        'gettext',
        'edx-ui-toolkit/js/utils/string-utils',
        'js/student_account/views/FormView',
        'text!templates/student_account/form_status.underscore'
    ], function(
        $, _, gettext,
        StringUtils,
        FormView,
        formStatusTpl
    ) {
        return FormView.extend({
            el: '#register-form',
            tpl: '#register-tpl',
            events: {
                'click .js-register': 'submitForm',
                'click .login-provider': 'thirdPartyAuth',
                'blur input[name=username]': 'liveValidateHandler',
                'blur input[name=password]': 'liveValidateHandler',
                'blur input[name=email]': 'liveValidateHandler',
                'blur input[name=confirm_email]': 'liveValidateHandler',
                'focus input[required]': 'handleRequiredMessageEvent'
            },
            liveValidationFields: [
                'username',
                'password',
                'email',
                'confirm_email'
            ],
            formType: 'register',
            formStatusTpl: formStatusTpl,
            authWarningJsHook: 'js-auth-warning',
            defaultFormErrorsTitle: gettext('We couldn\'t create your account.'),
            submitButton: '.js-register',

            preRender: function(data) {
                this.providers = data.thirdPartyAuth.providers || [];
                this.hasSecondaryProviders = (
                    data.thirdPartyAuth.secondaryProviders && data.thirdPartyAuth.secondaryProviders.length
                );
                this.currentProvider = data.thirdPartyAuth.currentProvider || '';
                this.errorMessage = data.thirdPartyAuth.errorMessage || '';
                this.platformName = data.platformName;
                this.autoSubmit = data.thirdPartyAuth.autoSubmitRegForm;
                this.hideAuthWarnings = data.hideAuthWarnings;

                this.listenTo(this.model, 'sync', this.saveSuccess);
                this.listenTo(this.model, 'validation', this.renderLiveValidations);
            },

            render: function(html) {
                var fields = html || '',
                    formErrorsTitle = gettext('An error occurred.');

                $(this.el).html(_.template(this.tpl)({
                /* We pass the context object to the template so that
                 * we can perform variable interpolation using sprintf
                 */
                    context: {
                        fields: fields,
                        currentProvider: this.currentProvider,
                        providers: this.providers,
                        hasSecondaryProviders: this.hasSecondaryProviders,
                        platformName: this.platformName
                    }
                }));

                this.postRender();

                // Must be called after postRender, since postRender sets up $formFeedback.
                if (this.errorMessage) {
                    this.renderErrors(formErrorsTitle, [this.errorMessage]);
                } else if (this.currentProvider && !this.hideAuthWarnings) {
                    this.renderAuthWarning();
                }

                if (this.autoSubmit) {
                    $(this.el).hide();
                    $('#register-honor_code').prop('checked', true);
                    this.submitForm();
                }

                return this;
            },

            handleRequiredMessageEvent: function(event) {
                this.renderRequiredMessage($(event.currentTarget));
            },

            renderRequiredMessage: function($el) {
                var name = $el.attr('id'),
                    $label = $('#' + name + '-required-label');
                $label.removeClass('hidden').text(gettext('(required)'));
            },

            hideRequiredMessage: function($el) {
                var name = $el.attr('id'),
                    $label = $('#' + name + '-required-label');
                $label.addClass('hidden');
            },

            renderLiveValidations: function($el, decisions) {
                var elId = $el.attr('id'),
                    $label = this.$form.find('label[for=' + elId + ']'),
                    $icon = $('#' + elId + '-validation-icon'),
                    $errorTip = $('#' + elId + '-validation-error'),
                    error = decisions.validation_decisions[$el.attr('name')],
                    errorId = elId + '-validation-error-container';

                if (error) {
                    this.renderLiveValidationError($el, $label, $icon, $errorTip, error);

                    // Update the error message in the container.
                    this.deleteError(errorId);
                    this.addError(error, errorId);
                    this.renderErrors(this.defaultFormErrorsTitle, this.errors);
                } else {
                    this.renderLiveValidationSuccess($el, $label, $icon, $errorTip);

                    // If an error for this field exists in the container, erase it.
                    if ($('#' + errorId).length) {
                        this.deleteError(errorId);
                        // Pass empty title if no errors, so we don't display the error box.
                        this.renderErrors(this.errors.length ? this.defaultFormErrorsTitle : '', this.errors);
                    }
                }
            },

            renderLiveValidationError: function($el, $label, $icon, $tip, error) {
                this.cleanLiveValidationSuccess($el, $label, $icon);
                $el.addClass('error');
                $label.addClass('error');
                $icon.addClass('fa-times error');
                $tip.text(error);
            },

            renderLiveValidationSuccess: function($el, $label, $icon, $tip) {
                var self = this;
                this.cleanLiveValidationError($el, $label, $icon);
                $el.addClass('success');
                $label.addClass('success');
                $icon.addClass('fa-check success');
                $tip.text('');

                this.hideRequiredMessage($el);

                // Hide success indicators after some time.
                setTimeout(function() { self.cleanLiveValidationSuccess($el, $label, $icon); },
                    10000
                );
            },

            cleanLiveValidationError: function($el, $label, $icon) {
                $el.removeClass('error');
                $label.removeClass('error');
                $icon.removeClass('fa-times error');
            },

            cleanLiveValidationSuccess: function($el, $label, $icon) {
                $el.removeClass('success');
                $label.removeClass('success');
                $icon.removeClass('fa-check success');
            },

            thirdPartyAuth: function(event) {
                var providerUrl = $(event.currentTarget).data('provider-url') || '';

                if (providerUrl) {
                    window.location.href = providerUrl;
                }
            },

            saveSuccess: function() {
                this.trigger('auth-complete');
            },

            saveError: function(error) {
                $(this.el).show(); // Show in case the form was hidden for auto-submission
                this.errors = _.flatten(
                    _.map(
                        // Something is passing this 'undefined'. Protect against this.
                        JSON.parse(error.responseText || '[]'),
                        function(errorList) {
                            return _.map(
                                errorList,
                                function(errorItem) {
                                    return StringUtils.interpolate('<li>{error}</li>', {
                                        error: errorItem.user_message
                                    });
                                }
                            );
                        }
                    )
                );
                this.renderErrors(this.defaultFormErrorsTitle, this.errors);
                this.toggleDisableButton(false);
            },

            postFormSubmission: function() {
                if (_.compact(this.errors).length) {
                // The form did not get submitted due to validation errors.
                    $(this.el).show(); // Show in case the form was hidden for auto-submission
                }
            },

            renderAuthWarning: function() {
                var msgPart1 = gettext('You\'ve successfully signed into %(currentProvider)s.'),
                    msgPart2 = gettext(
                        'We just need a little more information before you start learning with %(platformName)s.'
                    ),
                    fullMsg = _.sprintf(
                        msgPart1 + ' ' + msgPart2,
                        {currentProvider: this.currentProvider, platformName: this.platformName}
                    );

                this.renderFormFeedback(this.formStatusTpl, {
                    jsHook: this.authWarningJsHook,
                    message: fullMsg
                });
            },

            getFormData: function() {
                var obj = FormView.prototype.getFormData.apply(this, arguments),
                    $form = this.$form,
                    $confirmEmailElement = $form.find('input[name=confirm_email]'),
                    elements = $form[0].elements,
                    $el,
                    key = '',
                    i, j;

                for (i = 0; i < elements.length; i++) {
                    $el = $(elements[i]);
                    key = $el.attr('name') || false;

                    // Due to a bug in firefox, whitespaces in email type field are not removed.
                    // TODO: Remove this code once firefox bug is resolved.
                    if (key === 'email') {
                        $el.val($el.val().trim());
                    }

                    // Simulate live validation.
                    for (j = 0; j < this.liveValidationFields.length; ++j) {
                        if (key === this.liveValidationFields[j]) {
                            $el.blur();
                        }
                    }
                }

                if ($confirmEmailElement.length) {
                    obj.confirm_email = $confirmEmailElement.val();
                }

                return obj;
            },

            liveValidateHandler: function(event) {
                var $el = $(event.currentTarget);
                if ($el.attr('name') === 'confirm_email') {
                    this.liveValidateConfirmationEmail($el);
                } else {
                    this.liveValidate($el);
                }
            },

            liveValidate: function($el) {
                var data = {},
                    name,
                    i;
                for (i = 0; i < this.liveValidationFields.length; ++i) {
                    name = this.liveValidationFields[i];
                    data[name] = this.$form.find('input[name=' + name + ']').val();
                }
                FormView.prototype.liveValidate(
                    $el, '/api/user/v1/validation/registration', 'json', data, 'POST', this.model
                );
            },

            // We can validate confirmation emails fully client-side.
            liveValidateConfirmationEmail: function($confirmationEmail) {
                var validationDecisions = {validation_decisions: {confirm_email: ''}},
                    decisions = validationDecisions.validation_decisions,
                    $email = this.$form.find('input[name=email]');

                if ($email.val() !== $confirmationEmail.val() || !$confirmationEmail.val()) {
                    decisions.confirm_email = $confirmationEmail.data('errormsg-required');
                }

                this.renderLiveValidations($confirmationEmail, validationDecisions);
            }
        });
    });
}).call(this, define || RequireJS.define);
