pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "abla-one-gallery"
include(":android-app")
include(":runtime:android-host")
project(":runtime:android-host").projectDir = file(requireNotNull(System.getenv("ABLA_MOBILE_ROOT")) { "Run tools/build-android.sh with a selected mobile SDK" } + "/runtime/android-host")

