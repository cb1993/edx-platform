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
                'blur input[name=username]': 'liveValidate',
                'blur input[name=password]': 'liveValidate',
                'blur input[name=email]': 'liveValidate',
                'blur input[name=confirm_email]': 'validateConfirmationEmail',
                'focus input[required]': 'renderRequiredMessage'
            },
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

            renderRequiredMessage: function(event) {
                var name = $(event.currentTarget).attr('id'),
                    $label = $('#' + name + '-required-label');
                $label.removeClass('hidden').text(gettext('(required)'));
            },

            hideRequiredMessage: function($el) {
                var name = $el.attr('id'),
                    $label = $('#' + name + '-required-label');
                $label.addClass('hidden');
            },

            renderLiveValidations: function(target, decisions) {
                // TODO: Clean out the mess below?
                var $el = $(target),
                    $label = this.$form.find('label[for=' + $el.attr('id') + ']'),
                    $icon = $('#' + $el.attr('id') + '-validation-icon'),
                    $errorTip = $('#' + $el.attr('id') + '-validation-error'),
                    error = decisions.validation_decisions[$el.attr('name')],
                    errorId = $el.attr('id') + '-validation-error-container';

                if (error) {
                    this.renderLiveValidationError($el, $label, $icon, $errorTip, error);

                    // Update the error message in the container.
                    this.cleanErrorMessage(errorId);
                    this.errors.push(StringUtils.interpolate(
                        '<li id="{errorId}">{error}</li>', {
                            errorId: errorId,
                            error: error
                        }
                    ));
                    this.renderErrors(this.defaultFormErrorsTitle, this.errors);
                } else {
                    this.renderLiveValidationSuccess($el, $label, $icon, $errorTip);

                    // If an error for this field exists in the container, erase it.
                    if ($('#' + errorId).length) {
                        this.cleanErrorMessage(errorId);
                        // Pass empty title if no errors, so we don't display the error box.
                        this.renderErrors(this.errors.length ? this.defaultFormErrorsTitle : '', this.errors);
                    }
                }
            },

            renderLiveValidationError: function($el, $label, $icon, $tip, error) {
                $el.removeClass('success').addClass('error');
                $label.removeClass('success').addClass('error');
                $icon.removeClass('fa-check success').addClass('fa-times error');
                $tip.text(error);
            },

            renderLiveValidationSuccess: function($el, $label, $icon, $tip) {
                var self = this;
                $el.removeClass('error').addClass('success');
                $label.removeClass('error').addClass('success');
                $icon.removeClass('fa-times error').addClass('fa-check success');
                $tip.text('');

                this.hideRequiredMessage($el);

                // Hide success indicators after some time.
                setTimeout(function() { self.cleanLiveValidationSuccess($el, $label, $icon); },
                    10000
                );
            },

            cleanLiveValidationSuccess: function($el, $label, $icon) {
                $el.removeClass('success');
                $label.removeClass('success');
                $icon.removeClass('fa-check success');
            },

            cleanErrorMessage: function(id) {
                var i;
                for (i = 0; i < this.errors.length; ++i) {
                    if (this.errors[i].includes(id)) {
                        this.errors.splice(i, 1);
                    }
                }
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
                    $label,
                    $emailElement,
                    $confirmEmailElement,
                    email = '',
                    confirmEmail = '';

                $emailElement = $form.find('input[name=email]');
                $confirmEmailElement = $form.find('input[name=confirm_email]');

                if ($confirmEmailElement.length) {
                    email = $emailElement.val();
                    confirmEmail = $confirmEmailElement.val();
                    $label = $form.find('label[for=' + $confirmEmailElement.attr('id') + ']');

                    if (confirmEmail !== '' && email !== confirmEmail) {
                        this.errors.push(StringUtils.interpolate(
                            '<li>{error}</li>', {
                                error: $confirmEmailElement.data('errormsg-required')
                            }
                        ));
                        $confirmEmailElement.addClass('error');
                        $label.addClass('error');
                    } else if (confirmEmail !== '') {
                        obj.confirm_email = confirmEmail;
                        $confirmEmailElement.removeClass('error');
                        $label.removeClass('error');
                    }
                }

                return obj;
            },

            liveValidate: function(event) {
                var url = '/api/user/v1/validation/registration',
                    dataType = 'json',
                    data = {
                        username: $('#register-username').val(),
                        email: $('#register-email').val(),
                        password: $('#register-password').val()
                    },
                    method = 'POST';
                FormView.prototype.liveValidate(event, url, dataType, data, method, this.model);
            },

            validateConfirmationEmail: function(event) {
                var validationDecisions = {validation_decisions: {confirm_email: ''}},
                    decisions = validationDecisions.validation_decisions,
                    $email = this.$form.find('input[name=email]'),
                    $confirmationEmail = $(event.currentTarget);

                if ($email.val() !== $confirmationEmail.val()) {
                    decisions.confirm_email = gettext('Emails do not match.');
                }

                this.renderLiveValidations(event.currentTarget, validationDecisions);
            }
        });
    });
}).call(this, define || RequireJS.define);
