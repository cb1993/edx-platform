"""
Unittest for generate a test course in an given modulestore
"""
import ddt
import json
import mock
from django.core.management import CommandError, call_command
from django.test import override_settings

from xmodule.course_module import CourseFields
from xmodule.modulestore.tests.django_utils import ModuleStoreTestCase
from xmodule.modulestore.django import modulestore


@ddt.ddt
class TestGenerateCourses(ModuleStoreTestCase):
    """
    Unit tests for creating a course in split store via command line
    """

    def test_invalid_env(self):
        """
        Test that running the command in a non-development environment will raise the appropriate command error
        """
        with self.assertRaisesRegexp(CommandError, "Command should only be run in development environments"):
            arg = 'arg'
            call_command("generate_courses", arg)

    @override_settings(DEBUG=True)
    @mock.patch('contentstore.management.commands.generate_courses.logger')
    def test_generate_course_in_stores(self, mock_logger):
        """
        Test that a course is created successfully
        """
        settings = {"courses": [{
            "organization": "test-course-generator",
            "number": "1",
            "run": "1",
            "user": str(self.user.email),
            "fields": {"display_name": "test-course"}
        }]}
        arg = json.dumps(settings)
        call_command("generate_courses", arg)
        key = modulestore().make_course_key("test-course-generator", "1", "1")
        self.assertTrue(modulestore().has_course(key))
        mock_logger.info.assert_any_call("Created course-v1:test-course-generator+1+1")

    @override_settings(DEBUG=True)
    def test_invalid_json(self):
        """
        Test that providing an invalid JSON object will result in the appropriate command error
        """
        with self.assertRaisesRegexp(CommandError, "Invalid JSON object"):
            arg = "invalid_json"
            call_command("generate_courses", arg)

    @override_settings(DEBUG=True)
    def test_missing_courses_list(self):
        """
        Test that a missing list of courses in json will result in the appropriate command error
        """
        with self.assertRaisesRegexp(CommandError, "JSON object is missing courses list"):
            settings = {}
            arg = json.dumps(settings)
            call_command("generate_courses", arg)

    @override_settings(DEBUG=True)
    @mock.patch('contentstore.management.commands.generate_courses.logger')
    def test_missing_course_settings(self, mock_logger):
        """
        Test that missing required settings in JSON object will result in the appropriate error message
        """
        settings = {"courses": [{
            "number": "1",
            "run": "1",
            "user": str(self.user.email),
            "fields": {"display_name": "test-course"}
        }]}
        arg = json.dumps(settings)
        call_command("generate_courses", arg)
        mock_logger.warning.assert_any_call("Course json is missing the following settings: " + str(['organization']))

    @override_settings(DEBUG=True)
    @mock.patch('contentstore.management.commands.generate_courses.logger')
    def test_missing_display_name(self, mock_logger):
        """
        Test that missing required display_name in JSON object will result in the appropriate error message
        """
        settings = {"courses": [{
            "organization": "test-course-generator",
            "number": "1",
            "run": "1",
            "user": str(self.user.email),
            "fields": {}
        }]}
        arg = json.dumps(settings)
        call_command("generate_courses", arg)
        mock_logger.warning.assert_any_call("Fields json is missing display_name")

    @override_settings(DEBUG=True)
    @mock.patch('contentstore.management.commands.generate_courses.logger')
    def test_invalid_course_field(self, mock_logger):
        """
        Test that an invalid course field will result in the appropriate message
        """
        settings = {"courses": [{
            "organization": "test-course-generator",
            "number": "1",
            "run": "1",
            "user": str(self.user.email),
            "fields": {"display_name": "test-course", "invalid_field": "invalid_value"}
        }]}
        arg = json.dumps(settings)
        call_command("generate_courses", arg)
        mock_logger.info.assert_any_call(
            "The following settings are not valid CourseFields and will not be used: " + str([u'invalid_field'])
        )

    @override_settings(DEBUG=True)
    @mock.patch('contentstore.management.commands.generate_courses.logger')
    def test_missing_course_fields(self, mock_logger):
        """
        Test that missing required display_name in JSON object will result in the appropriate message
        """
        course_fields = CourseFields.__dict__.keys()
        # Remove non-fields
        for field in ["__doc__", "__module__", "__weakref__", "__dict__"]:
            course_fields.remove(field)
        # Disable non json-representable fields, e.g. Date objects
        disabled_fields = [
            "certificate_available_date", "announcement", "tabs", "enrollment_start", "enrollment_end", "start", "end"
        ]
        for field in disabled_fields:
            course_fields.remove(field)
        course_fields.remove("mobile_available")
        course_fields.remove("display_name")
        settings = {"courses": [{
            "organization": "test-course-generator",
            "number": "1",
            "run": "1",
            "user": str(self.user.email),
            "fields": {"display_name": "test-course", "mobile_available": True}
        }]}
        arg = json.dumps(settings)
        call_command("generate_courses", arg)
        mock_logger.info.assert_any_call(
            "The following CourseFields were not set by the user and will be set to their default values: " +
            str(course_fields)
        )
