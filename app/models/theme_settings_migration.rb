# frozen_string_literal: true

class ThemeSettingsMigration < ActiveRecord::Base
  belongs_to :theme
  belongs_to :theme_field

  def calculate_diff(settings_before, settings_after)
    diff = { additions: [], deletions: [] }

    before_keys = settings_before.keys
    after_keys = settings_after.keys

    removed_keys = before_keys - after_keys
    removed_keys.each { |key| diff[:deletions] << { key: key, val: settings_before[key] } }

    added_keys = after_keys - before_keys
    added_keys.each { |key| diff[:additions] << { key: key, val: settings_after[key] } }

    common_keys = before_keys & after_keys
    common_keys.each do |key|
      if settings_before[key] != settings_after[key]
        diff[:deletions] << { key: key, val: settings_before[key] }
        diff[:additions] << { key: key, val: settings_after[key] }
      end
    end

    self.diff = diff
  end
end
