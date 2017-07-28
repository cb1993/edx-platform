"""
Django management command to generate a test course in a specific modulestore
"""
import json
import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError

from contentstore.management.commands.utils import user_from_str
from contentstore.views.course import create_new_course_in_store
from xmodule.modulestore import ModuleStoreEnum
from xmodule.course_module import CourseFields
from openedx.core.djangoapps.content.course_overviews.models import CourseOverview

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    """ Generate a basic course """
    help = 'Generate a course with settings on studio'

    def add_arguments(self, parser):
        parser.add_argument(
            'courses',
            help='JSON object with values for store, user, name, organization, number, fields'
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            # DEBUG is turned on in development settings and off in production settings
            raise CommandError("Command should only be run in development environments")
        try:
            arg = json.loads(options["courses"])
        except ValueError:
            raise CommandError("Invalid JSON object")
        try:
            courses = arg["courses"]
        except KeyError:
            raise CommandError("JSON object is missing courses list")

        for course_settings in courses:
            if not self._course_is_valid(course_settings):
                logger.warning("Can't create course, proceeding to next course")
                continue

            if "user" in course_settings:
                user = user_from_str(course_settings["user"])
            else:
                user = user_from_str("edx@example.com")
            org = course_settings["organization"]
            num = course_settings["number"]
            run = course_settings["run"]
            fields = course_settings["fields"]
            fields = self._process_course_fields_settings(fields)

            # Create the course
            new_course = create_new_course_in_store("split", user, org, num, run, fields)
            logger.info("Created {}".format(unicode(new_course.id)))

    def _process_course_fields_settings(self, fields):
        """ Returns a validated list of course fields """
        # Retrieve list of CourseFields
        available_fields = CourseFields.__dict__.keys()
        # Remove non-fields
        for field in ("__doc__", "__module__", "__weakref__", "__dict__"):
            available_fields.remove(field)
        # Disable fields not representable in json, e.g. dates
        disabled_fields = [
            "certificate_available_date", "announcement", "tabs", "enrollment_start", "enrollment_end", "start", "end"
        ]
        for field in disabled_fields:
            available_fields.remove(field)
        invalid_fields = []
        valid_fields = dict(fields)

        for field in fields:
            if field not in available_fields:
                del valid_fields[field]
                invalid_fields.append(field)
            elif fields[field] is None:
                del valid_fields[field]
            else:
                available_fields.remove(field)
        if invalid_fields:
            logger.info(
                "The following settings are not valid CourseFields and will not be used: " + str(invalid_fields)
            )
        if available_fields:
            logger.info(
                "The following CourseFields were not set by the user and will be set to their default values: " +
                str(available_fields)
            )
        return valid_fields

    def _course_is_valid(self, course):
        """ Returns true if the course contains required settings """
        is_valid = True

        # Check course settings
        missing_settings = []
        if "organization" not in course:
            missing_settings.append("organization")
        if "number" not in course:
            missing_settings.append("number")
        if "run" not in course:
            missing_settings.append("run")
        if "fields" not in course:
            missing_settings.append("fields")
        if missing_settings:
            logger.warning("Course json is missing the following settings: " + str(missing_settings))
            is_valid = False

        # Check for display name
        if "fields" in course:
            if ("display_name" not in course["fields"]) or (course["fields"]["display_name"] is None):
                logger.warning("Fields json is missing display_name")
                is_valid = False

        return is_valid
