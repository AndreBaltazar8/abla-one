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
project(":runtime:android-host").projectDir = file("../../../../abla-mobile/runtime/android-host")

